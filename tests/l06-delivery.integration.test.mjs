// L06 (fatias A e B) — operação: estrutura/alocação, contrato encerrado,
// cobertura, passagem de turno, livro de ocorrências, checklists operacionais,
// evidências privadas e auditoria fail-closed via HTTP real, PostgreSQL descartável e Chromium.
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
  return { status: response.status, body: parsed, setCookie: response.headers.getSetCookie?.() || [] };
}
const ops = (path, options) => api(`/api/ops${path}`, options);

async function launchBrowser() {
  return chromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== "--disable-web-security"),
    headless: true,
  });
}

async function insertContract(companyId, status) {
  const id = uuid();
  await pool.query(
    `INSERT INTO crm_contracts (id, proposal_id, proposal_version, company_id, title, status, origin, total_cost, total_price, idempotency_key, created_by)
     VALUES ($1, NULL, 1, $2, $3, $4, 'manual', 0, 0, $5, 'admin')`,
    [id, companyId, `Contrato QA L06 ${status}`, status, uuid()],
  );
  return id;
}
async function insertEmployee(status, cargo = "Vigilante") {
  const id = uuid();
  await pool.query(
    `INSERT INTO hr_employees (id, matricula, display_name, cargo, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, `L06-${id.slice(0, 8)}`, `QA Funcionário ${status} ${id.slice(0, 4)}`, cargo, status],
  );
  return id;
}
async function allocationCount(employeeId) {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM ops_allocations WHERE employee_id=$1", [employeeId]);
  return rows[0].n;
}

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), "seg-l06-"));
  const port = 5200 + Math.floor(Math.random() * 300);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-l06", SITE_ADMIN_SESSION_SECRET: `${uuid()}${uuid()}`,
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

test("L06 Fatia A: alocação escopada por contrato, contrato encerrado bloqueia nova alocação, auditoria fail-closed", { skip: !RUN, timeout: 180_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const commercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });

  // Fixtures sintéticas: empresa/unidade e contratos canônicos L05.
  const companyId = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA L06 Empresa','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'QA Unidade',true)", [uuid(), companyId]);
  const contractActive = await insertContract(companyId, "ativo");
  const contractToClose = await insertContract(companyId, "ativo");

  const empActive = await insertEmployee("ativo");
  const empActive2 = await insertEmployee("ativo");
  const empTerminated = await insertEmployee("desligado");

  // 1. Anônimo é negado (fail-closed) em leitura e escrita.
  assert.equal((await ops("/posts")).status, 401, "anonymous post read denied");
  assert.equal((await ops("/allocations", { method: "POST", body: { post_id: uuid(), employee_id: uuid(), shift_template_id: uuid(), allocation_date: "2026-10-01" } })).status, 401, "anonymous allocation denied");

  // 2. Papel indevido (comercial) não muta a operação.
  assert.equal((await ops("/posts", { cookie: commercial.cookie, method: "POST", body: { name: "Posto indevido", company_id: companyId } })).status, 403, "commercial cannot create posts");

  // 3. Estruturas base via HTTP real (área de operação, fora da borda de RH).
  const shift = await ops("/shift-templates", { cookie: admin.cookie, method: "POST", body: { name: "Diurno 12h QA", shift_type: "12x36_dia", start_time: "07:00", end_time: "19:00", duration_hours: 12 } });
  assert.equal(shift.status, 201, "shift template created");
  const shiftId = shift.body.template.id;

  // 4. Posto vinculado a contrato ativo. Empresa divergente do contrato é negada (anti troca de ID).
  const otherCompany = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'Outra Empresa','client','active','admin')", [otherCompany]);
  assert.equal((await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Posto empresa trocada", company_id: otherCompany, contract_id: contractActive } })).status, 409, "contract/company mismatch denied");

  const postActive = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Portaria Central", company_id: companyId, contract_id: contractActive, post_type: "portaria" } });
  assert.equal(postActive.status, 201, "post on active contract created");
  const postActiveId = postActive.body.post.id;
  const postActive2 = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Portaria Fundos", company_id: companyId, contract_id: contractActive, post_type: "portaria" } });
  const postActive2Id = postActive2.body.post.id;
  const postClose = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Posto a encerrar", company_id: companyId, contract_id: contractToClose } });
  const postCloseId = postClose.body.post.id;

  // 5. Troca de ID: posto e funcionário inexistentes são negados sem colisão de FK.
  assert.equal((await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: uuid(), employee_id: empActive, shift_template_id: shiftId, allocation_date: "2026-10-01" } })).status, 404, "unknown post denied");
  assert.equal((await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActiveId, employee_id: uuid(), shift_template_id: shiftId, allocation_date: "2026-10-01" } })).status, 404, "unknown employee denied");

  // 6. Funcionário desligado não é escalado.
  assert.equal((await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActiveId, employee_id: empTerminated, shift_template_id: shiftId, allocation_date: "2026-10-01" } })).status, 409, "terminated employee not operational");

  // 7. Alocação válida persiste exatamente uma vez; retry idêntico não duplica.
  const created = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActiveId, employee_id: empActive, shift_template_id: shiftId, allocation_date: "2026-10-01" } });
  assert.equal(created.status, 201, "valid allocation created");
  assert.equal(await allocationCount(empActive), 1, "exactly one allocation persisted");
  const retry = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActiveId, employee_id: empActive, shift_template_id: shiftId, allocation_date: "2026-10-01" } });
  assert.equal(retry.status, 409, "duplicate allocation rejected");
  assert.equal(await allocationCount(empActive), 1, "retry did not create a second row");

  // 8. Sobreposição de turno no mesmo dia é negada.
  const overlap = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActive2Id, employee_id: empActive, shift_template_id: shiftId, allocation_date: "2026-10-01" } });
  assert.equal(overlap.status, 409, "overlapping shift denied");
  assert.equal(overlap.body.error, "overlap_detected");

  // 9. Contrato encerrado bloqueia nova alocação mas preserva o histórico existente.
  const preClose = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postCloseId, employee_id: empActive2, shift_template_id: shiftId, allocation_date: "2026-10-02" } });
  assert.equal(preClose.status, 201, "allocation on operational contract allowed");
  const historyBefore = await allocationCount(empActive2);
  await pool.query("UPDATE crm_contracts SET status='encerrado' WHERE id=$1", [contractToClose]);
  const blocked = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postCloseId, employee_id: empActive2, shift_template_id: shiftId, allocation_date: "2026-10-05" } });
  assert.equal(blocked.status, 409, "closed contract blocks new allocation");
  assert.equal(blocked.body.error, "contract_not_operational");
  assert.equal(await allocationCount(empActive2), historyBefore, "closed contract preserves history, no new row");

  // 10. Auditoria indisponível: a alocação falha sem efeito parcial (fail-closed).
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_l06_bak");
  try {
    const before = await allocationCount(empActive2);
    const auditFail = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActiveId, employee_id: empActive2, shift_template_id: shiftId, allocation_date: "2026-10-09" } });
    assert.equal(auditFail.status, 503, "allocation fails closed when audit unavailable");
    assert.equal(await allocationCount(empActive2), before, "no partial effect without audit trail");
  } finally {
    await pool.query("ALTER TABLE audit_log_l06_bak RENAME TO audit_log");
  }
  // Após restaurar a auditoria, a alocação volta a persistir com trilha.
  const recovered = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postActiveId, employee_id: empActive2, shift_template_id: shiftId, allocation_date: "2026-10-09" } });
  assert.equal(recovered.status, 201, "allocation persists again once audit restored");
  const trail = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='ops_allocation_create' AND target=$1", [recovered.body.allocation.id]);
  assert.equal(trail.rows[0].n, 1, "durable audit trail written in the same transaction");
});

test("L06 Fatia B: cobertura, passagem de turno, ocorrência, checklists, evidências e auditoria fail-closed", { skip: !RUN, timeout: 240_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const commercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });

  // 1. Fixtures sintéticas: empresas, unidades e contratos L05 canônicos.
  const companyA = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'Empresa A Operacional','client','active','admin')", [companyA]);
  const unitA = uuid();
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'Unidade A Matriz',true)", [unitA, companyA]);
  const contractA = await insertContract(companyA, "ativo");
  const contractToClose = await insertContract(companyA, "ativo");

  const companyB = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'Empresa B Outra','client','active','admin')", [companyB]);
  const unitB = uuid();
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'Unidade B Filial',true)", [unitB, companyB]);
  const contractB = await insertContract(companyB, "ativo");

  // Portal accounts e documentos L02 privados para testar escopo de evidências privadas
  const clientAccA = uuid();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,'Cliente A Conta','active','marcelo')", [clientAccA]);
  const clientContractA = uuid();
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,'Portal Contrato A','vigilancia','active','marcelo')", [clientContractA, clientAccA]);
  await pool.query("INSERT INTO crm_contract_portal_links (contract_id,client_contract_id,note) VALUES ($1,$2,'Vínculo portal A QA')", [contractA, clientContractA]);
  const docA = uuid();
  await pool.query("INSERT INTO client_documents (id,client_account_id,contract_id,title,category,original_filename,content_type,size_bytes,storage_key,uploaded_by) VALUES ($1,$2,$3,'Evidencia A','operacional','evid_a.pdf','application/pdf',1,$4,'marcelo')", [docA, clientAccA, clientContractA, `qa${uuid().replaceAll("-", "").slice(0, 30)}`]);

  const clientAccB = uuid();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,'Cliente B Conta','active','marcelo')", [clientAccB]);
  const clientContractB = uuid();
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,'Portal Contrato B','vigilancia','active','marcelo')", [clientContractB, clientAccB]);
  await pool.query("INSERT INTO crm_contract_portal_links (contract_id,client_contract_id,note) VALUES ($1,$2,'Vínculo portal B QA')", [contractB, clientContractB]);
  const docB = uuid();
  await pool.query("INSERT INTO client_documents (id,client_account_id,contract_id,title,category,original_filename,content_type,size_bytes,storage_key,uploaded_by) VALUES ($1,$2,$3,'Evidencia B','operacional','evid_b.pdf','application/pdf',1,$4,'marcelo')", [docB, clientAccB, clientContractB, `qa${uuid().replaceAll("-", "").slice(0, 30)}`]);

  // Turno e Postos
  const shiftRes = await ops("/shift-templates", { cookie: admin.cookie, method: "POST", body: { name: "Noturno 12h QA", shift_type: "12x36_noite", start_time: "19:00", end_time: "07:00", duration_hours: 12 } });
  const shiftId = shiftRes.body.template.id;

  const postResA = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Posto Portaria A", company_id: companyA, unit_id: unitA, contract_id: contractA, post_type: "portaria" } });
  const postA = postResA.body.post.id;

  const postResClose = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Posto Temporário A", company_id: companyA, unit_id: unitA, contract_id: contractToClose, post_type: "vigilancia" } });
  assert.equal(postResClose.status, 201, "post close created");
  const postClose = postResClose.body.post.id;

  // Cargo/qualificação exigida no Posto A
  const roleRes = await ops("/job-roles", { cookie: admin.cookie, method: "POST", body: { name: "Vigilante Qualificado L06", role_type: "funcao" } });
  if (roleRes.status !== 201) {
    console.error("DEBUG roleRes:", roleRes.status, roleRes.body);
  }
  assert.equal(roleRes.status, 201, "job role created");
  const roleId = roleRes.body.role.id;
  await pool.query("INSERT INTO ops_post_shift_needs (post_id, shift_template_id, role_id, day_of_week, required_headcount, created_by) VALUES ($1,$2,$3,1,1,'admin')", [postA, shiftId, roleId]);

  // Funcionários
  const empAbsent = await insertEmployee("ativo", "Vigilante");
  const empUnqualified = await insertEmployee("ativo", "Vigilante");
  const empQualified = await insertEmployee("ativo", "Vigilante Qualificado L06");
  const empConflicted = await insertEmployee("ativo", "Vigilante Qualificado L06");
  const empTerminated = await insertEmployee("desligado", "Vigilante");

  // Concede qualificação para empQualified e empConflicted
  await pool.query("INSERT INTO ops_employee_qualifications (employee_id, role_id, certification_type, is_valid, valid_until, created_by) VALUES ($1,$2,'CNV Vigilante',true,'2030-12-31','admin')", [empQualified, roleId]);
  await pool.query("INSERT INTO ops_employee_qualifications (employee_id, role_id, certification_type, is_valid, valid_until, created_by) VALUES ($1,$2,'CNV Vigilante',true,'2030-12-31','admin')", [empConflicted, roleId]);

  // Aloca empConflicted no mesmo dia 2026-10-15 no turno Noturno para gerar conflito
  await pool.query("INSERT INTO ops_allocations (post_id, employee_id, shift_template_id, allocation_date, status, created_by) VALUES ($1,$2,$3,'2026-10-15','confirmado','admin')", [postA, empConflicted, shiftId]);

  // ==============================================================
  // 2. OPS-05: Cobertura e Substituição
  // ==============================================================
  // 2.1 Anônimo negado (401), papel comercial negado (403)
  assert.equal((await ops("/coverage-requests")).status, 401, "anonymous coverage request read denied");
  assert.equal((await ops("/coverage-requests", { cookie: commercial.cookie, method: "POST", body: { post_id: postA } })).status, 403, "commercial cannot create coverage request");

  // 2.2 Troca de ID: posto inexistente negado (404)
  assert.equal((await ops("/coverage-requests", { cookie: admin.cookie, method: "POST", body: { post_id: uuid(), coverage_date: "2026-10-15", shift_template_id: shiftId } })).status, 404, "unknown post denied for coverage");

  // 2.3 Contrato encerrado bloqueia nova necessidade de cobertura
  await pool.query("UPDATE crm_contracts SET status='encerrado' WHERE id=$1", [contractToClose]);
  const closedCov = await ops("/coverage-requests", { cookie: admin.cookie, method: "POST", body: { post_id: postClose, coverage_date: "2026-10-15", shift_template_id: shiftId } });
  assert.equal(closedCov.status, 409, "closed contract blocks new coverage request");
  assert.equal(closedCov.body.error, "contract_not_operational");

  // 2.4 Criação válida de solicitação de cobertura
  const covReq = await ops("/coverage-requests", { cookie: admin.cookie, method: "POST", body: { post_id: postA, coverage_date: "2026-10-15", shift_template_id: shiftId, reason: "Falta médica do titular" } });
  assert.equal(covReq.status, 201, "coverage request created on active contract");
  const covReqId = covReq.body.request.id;

  // 2.5 Idempotência: duplicidade de cobertura em aberto rejeitada
  const dupCov = await ops("/coverage-requests", { cookie: admin.cookie, method: "POST", body: { post_id: postA, coverage_date: "2026-10-15", shift_template_id: shiftId, reason: "Falta médica retry" } });
  assert.equal(dupCov.status, 409, "duplicate open coverage request rejected");
  assert.equal(dupCov.body.error, "duplicate_coverage_request");

  // 2.6 Candidato: funcionário inexistente (404) ou desligado (409)
  assert.equal((await ops("/substitution-candidates", { cookie: admin.cookie, method: "POST", body: { coverage_request_id: covReqId, employee_id: uuid() } })).status, 404, "unknown employee candidate denied");
  assert.equal((await ops("/substitution-candidates", { cookie: admin.cookie, method: "POST", body: { coverage_request_id: covReqId, employee_id: empTerminated } })).status, 409, "terminated employee candidate denied");

  // 2.7 Candidato com conflito de turno/sobreposição rejeitado
  const conflictCand = await ops("/substitution-candidates", { cookie: admin.cookie, method: "POST", body: { coverage_request_id: covReqId, employee_id: empConflicted } });
  assert.equal(conflictCand.status, 409, "candidate with shift conflict rejected");
  assert.equal(conflictCand.body.error, "candidate_conflict");

  // 2.8 Candidato sem a qualificação exigida pelo posto rejeitado
  const unqualCand = await ops("/substitution-candidates", { cookie: admin.cookie, method: "POST", body: { coverage_request_id: covReqId, employee_id: empUnqualified } });
  assert.equal(unqualCand.status, 409, "unqualified candidate rejected");
  assert.equal(unqualCand.body.error, "candidate_unqualified");

  // 2.9 Candidato válido e habilitado aceito
  const qualCand = await ops("/substitution-candidates", { cookie: admin.cookie, method: "POST", body: { coverage_request_id: covReqId, employee_id: empQualified, availability_status: "disponivel", distance_km: 5.5, score: 95 } });
  assert.equal(qualCand.status, 201, "qualified candidate added");
  const candidateId = qualCand.body.candidate.id;

  // 2.10 Decisão humana: selecionar candidato atualiza o status da cobertura
  const selectRes = await ops("/substitution-candidates", { cookie: admin.cookie, method: "PATCH", body: { id: candidateId, is_selected: true } });
  assert.equal(selectRes.status, 200, "human decision selected candidate");
  const checkCov = await ops(`/coverage-requests?post_id=${postA}`, { cookie: admin.cookie });
  assert.equal(checkCov.body.requests[0].status, "candidato_encontrado", "coverage status updated upon selection");

  // 2.11 Comunicação interna auditável
  const commRes = await ops("/coverage-communications", { cookie: admin.cookie, method: "POST", body: { coverage_request_id: covReqId, recipient_type: "employee", recipient_id: empQualified, message: "Escalado para cobertura dia 15/10 no Posto A", channel: "sistema" } });
  assert.equal(commRes.status, 201, "coverage communication recorded");

  // ==============================================================
  // 3. OPS-06: Passagem de Turno (Handovers)
  // ==============================================================
  // 3.1 Anônimo negado (401), posto inexistente negado (404), mesmo funcionário negado (400)
  assert.equal((await ops("/handovers")).status, 401, "anonymous handover denied");
  assert.equal((await ops("/handovers", { cookie: admin.cookie, method: "POST", body: { from_post_id: uuid(), from_employee_id: empQualified } })).status, 404, "unknown post handover denied");
  assert.equal((await ops("/handovers", { cookie: admin.cookie, method: "POST", body: { from_post_id: postA, from_employee_id: empQualified, to_employee_id: empQualified } })).status, 400, "same employee handover denied");

  // 3.2 Contrato encerrado bloqueia nova passagem
  assert.equal((await ops("/handovers", { cookie: admin.cookie, method: "POST", body: { from_post_id: postClose, from_employee_id: empQualified, to_employee_id: empAbsent } })).status, 409, "closed contract handover blocked");

  // 3.3 Criação válida de passagem com pendências e itens de guarda
  const handRes = await ops("/handovers", { cookie: admin.cookie, method: "POST", body: {
    from_post_id: postA,
    from_employee_id: empQualified,
    to_employee_id: empAbsent,
    shift_template_id: shiftId,
    pending_tasks: "Conferir cadeado do portão lateral",
    keys_handover: [{ key_name: "Chave Portão 01", returned: true }],
    occurrences_summary: "Sem alterações graves"
  } });
  assert.equal(handRes.status, 201, "valid handover created");
  const handoverId = handRes.body.handover.id;
  assert.match(handRes.body.handover.protocol, /^HND-OPS-/, "unique protocol generated");

  // 3.4 Ciência / Aceite de passagem é idempotente
  const accept1 = await ops("/handovers", { cookie: admin.cookie, method: "PATCH", body: { id: handoverId, status: "aceito" } });
  assert.equal(accept1.status, 200, "handover accepted");
  assert.equal(accept1.body.handover.status, "aceito");
  const acceptRetry = await ops("/handovers", { cookie: admin.cookie, method: "PATCH", body: { id: handoverId, status: "aceito" } });
  assert.equal(acceptRetry.status, 200, "handover acceptance retry is idempotent");

  // 3.5 Escalonamento com motivo
  const handRes2 = await ops("/handovers", { cookie: admin.cookie, method: "POST", body: { from_post_id: postA, from_employee_id: empQualified, to_employee_id: empAbsent } });
  const handoverId2 = handRes2.body.handover.id;
  assert.equal((await ops("/handovers", { cookie: admin.cookie, method: "PATCH", body: { id: handoverId2, status: "escalonado" } })).status, 400, "escalation without reason rejected");
  const escRes = await ops("/handovers", { cookie: admin.cookie, method: "PATCH", body: { id: handoverId2, status: "escalonado", reason: "Substituto não compareceu no horário" } });
  assert.equal(escRes.status, 200, "handover escalated with reason");
  const escHistory = await ops(`/handover-escalations?handover_id=${handoverId2}`, { cookie: admin.cookie });
  assert.equal(escHistory.body.escalations.length, 1, "escalation trail persisted");

  // ==============================================================
  // 4. OPS-07: Livro de Ocorrências e Evidências Privadas
  // ==============================================================
  // 4.1 Anônimo negado (401), contrato encerrado negado (409)
  assert.equal((await ops("/occurrence-book")).status, 401, "anonymous occurrence read denied");
  assert.equal((await ops("/occurrence-book", { cookie: admin.cookie, method: "POST", body: { post_id: postClose, title: "Ocorrência Contrato Encerrado", description: "Tentativa em contrato inativo" } })).status, 409, "closed contract occurrence blocked");

  // 4.2 Criação válida de ocorrência com protocolo e histórico imutável inicial
  const occRes = await ops("/occurrence-book", { cookie: admin.cookie, method: "POST", body: {
    post_id: postA,
    employee_id: empQualified,
    category: "seguranca",
    severity: "media",
    title: "Portão lateral encontrado destrancado",
    description: "Durante a ronda diurna o portão dos fundos estava sem cadeado."
  } });
  assert.equal(occRes.status, 201, "occurrence created");
  const occId = occRes.body.occurrence.id;
  assert.match(occRes.body.occurrence.protocol, /^OCC-OPS-/, "occurrence protocol generated");

  // 4.3 Retificação exige motivo obrigatório
  assert.equal((await ops("/occurrence-book", { cookie: admin.cookie, method: "PATCH", body: { id: occId, description: "Descrição alterada sem motivo", is_retification: true } })).status, 400, "retification without reason rejected");

  // 4.4 Retificação válida registra no histórico imutável e incrementa contador
  const retRes = await ops("/occurrence-book", { cookie: admin.cookie, method: "PATCH", body: {
    id: occId,
    description: "Durante a ronda diurna o portão dos fundos estava aberto e cadeado quebrado.",
    is_retification: true,
    reason: "Correção de informação após perícia local"
  } });
  assert.equal(retRes.status, 200, "retification persisted");
  assert.equal(retRes.body.occurrence.retification_count, 1, "retification count incremented");

  const occHist = await ops(`/occurrence-history?occurrence_id=${occId}`, { cookie: admin.cookie });
  assert.equal(occHist.body.history.length, 2, "initial + retification history records preserved");
  assert.equal(occHist.body.history[0].is_retification, true, "retification flag recorded");

  // 4.5 Evidência privada com validação de escopo L02: documento de outra empresa/contrato negado (403)
  const crossDocEvid = await ops("/occurrence-evidences", { cookie: admin.cookie, method: "POST", body: {
    occurrence_id: occId,
    client_document_id: docB, // Documento da Empresa B em ocorrência da Empresa A
    file_name: "foto_portao.jpg"
  } });
  assert.equal(crossDocEvid.status, 403, "cross-tenant private document evidence rejected");

  // 4.6 Evidência privada com documento no escopo correto aceita
  const validEvid = await ops("/occurrence-evidences", { cookie: admin.cookie, method: "POST", body: {
    occurrence_id: occId,
    client_document_id: docA,
    file_name: "foto_portao_cadeado.jpg"
  } });
  assert.equal(validEvid.status, 201, "scoped private document evidence linked");

  // 4.7 Ações de ocorrência
  const actionRes = await ops("/occurrence-actions", { cookie: admin.cookie, method: "POST", body: {
    occurrence_id: occId,
    action_type: "Troca de cadeado",
    description: "Instalação de novo cadeado de alta segurança"
  } });
  assert.equal(actionRes.status, 201, "occurrence action created");

  // ==============================================================
  // 5. OPS-08: Checklists Operacionais e Itens Obrigatórios
  // ==============================================================
  // 5.1 Criação de modelo de checklist com itens obrigatórios e opcionais
  const tplRes = await ops("/checklist-templates", { cookie: admin.cookie, method: "POST", body: {
    title: `Checklist QA Abertura ${uuid().slice(0, 6)}`,
    service_type: "portaria",
    frequency: "diaria",
    is_mandatory: true,
    required_items: [
      { desc: "Testar rádio comunicador", required: true },
      { desc: "Conferir chaves do quadro", required: true },
      { desc: "Regar plantas da recepção", required: false }
    ]
  } });
  assert.equal(tplRes.status, 201, "checklist template created");
  const templateId = tplRes.body.template.id;

  // 5.2 Instância em posto ativo gera itens com obrigatoriedade
  const instRes = await ops("/checklist-instances", { cookie: admin.cookie, method: "POST", body: {
    template_id: templateId,
    post_id: postA,
    employee_id: empQualified,
    scheduled_date: "2026-10-15"
  } });
  assert.equal(instRes.status, 201, "checklist instance created");
  const instanceId = instRes.body.instance.id;

  // 5.3 Idempotência: duplicidade de instância para mesmo template, posto e data rejeitada
  const dupInst = await ops("/checklist-instances", { cookie: admin.cookie, method: "POST", body: {
    template_id: templateId,
    post_id: postA,
    scheduled_date: "2026-10-15"
  } });
  assert.equal(dupInst.status, 409, "duplicate checklist instance rejected");

  // 5.4 Finalização rejeitada enquanto itens obrigatórios estiverem pendentes (409)
  const prematureClose = await ops("/checklist-instances", { cookie: admin.cookie, method: "PATCH", body: { id: instanceId, status: "concluido" } });
  assert.equal(prematureClose.status, 409, "completion blocked when mandatory items pending");
  assert.equal(prematureClose.body.error, "mandatory_items_pending");

  // 5.5 Busca os itens gerados e marca todos os obrigatórios como checados
  const itemsRes = await ops(`/checklist-items?instance_id=${instanceId}`, { cookie: admin.cookie });
  assert.equal(itemsRes.body.items.length, 3, "3 checklist items generated from template");
  for (const item of itemsRes.body.items) {
    if (item.is_required) {
      const checkItem = await ops("/checklist-items", { cookie: admin.cookie, method: "PATCH", body: { id: item.id, is_checked: true } });
      assert.equal(checkItem.status, 200, `item ${item.item_description} checked`);
    }
  }

  // 5.6 Agora a finalização é aprovada e retries são idempotentes
  const finishRes = await ops("/checklist-instances", { cookie: admin.cookie, method: "PATCH", body: { id: instanceId, status: "concluido", score: 100 } });
  assert.equal(finishRes.status, 200, "checklist instance completed after mandatory items satisfied");
  const finishRetry = await ops("/checklist-instances", { cookie: admin.cookie, method: "PATCH", body: { id: instanceId, status: "concluido" } });
  assert.equal(finishRetry.status, 200, "checklist completion retry is idempotent");

  // ==============================================================
  // 6. Auditoria Fail-Closed em Operações de Cobertura/Passagem/Ocorrência
  // ==============================================================
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_l06_b_bak");
  try {
    const auditCovFail = await ops("/coverage-requests", { cookie: admin.cookie, method: "POST", body: { post_id: postA, coverage_date: "2026-10-20", shift_template_id: shiftId } });
    assert.equal(auditCovFail.status, 503, "coverage request fails closed when audit unavailable");

    const auditHandFail = await ops("/handovers", { cookie: admin.cookie, method: "POST", body: { from_post_id: postA, from_employee_id: empQualified, to_employee_id: empAbsent } });
    assert.equal(auditHandFail.status, 503, "handover fails closed when audit unavailable");

    const auditOccFail = await ops("/occurrence-book", { cookie: admin.cookie, method: "POST", body: { post_id: postA, title: "Falha de Auditoria", description: "Teste sem trilha" } });
    assert.equal(auditOccFail.status, 503, "occurrence fails closed when audit unavailable");
  } finally {
    await pool.query("ALTER TABLE audit_log_l06_b_bak RENAME TO audit_log");
  }

  // ==============================================================
  // 7. Chromium Real carrega `/admin/operacao` e navega pelas abas da Fatia B
  // ==============================================================
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    await context.addCookies(admin.cookie.split("; ").map(pair => {
      const idx = pair.indexOf("=");
      return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: "127.0.0.1", path: "/" };
    }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/operacao`, { waitUntil: "networkidle" });

    // Aba Postos e Alocações
    await page.waitForSelector("#posts-title", { timeout: 30_000 });
    let content = await page.textContent("body");
    assert.match(content || "", /Posto Portaria A/, "operations page renders synthetic post");

    // Aba Cobertura (OPS-05)
    await page.click("button:has-text('Cobertura (OPS-05)')");
    await page.waitForSelector("#coverage-title", { timeout: 10_000 });
    content = await page.textContent("body");
    assert.match(content || "", /Falta médica do titular/, "coverage tab renders synthetic coverage request");

    // Aba Passagem (OPS-06)
    await page.click("button:has-text('Passagem de Turno (OPS-06)')");
    await page.waitForSelector("#handover-title", { timeout: 10_000 });
    content = await page.textContent("body");
    assert.match(content || "", /HND-OPS-/, "handover tab renders synthetic protocol");

    // Aba Ocorrências (OPS-07)
    await page.click("button:has-text('Livro de Ocorrências (OPS-07)')");
    await page.waitForSelector("#occurrence-title", { timeout: 10_000 });
    content = await page.textContent("body");
    assert.match(content || "", /Portão lateral/, "occurrence tab renders synthetic occurrence");

    // Aba Checklists (OPS-08)
    await page.click("button:has-text('Checklists de Posto (OPS-08)')");
    await page.waitForSelector("#checklist-title", { timeout: 10_000 });
    content = await page.textContent("body");
    assert.match(content || "", /Checklists de Posto e Execução/, "checklists tab renders synthetic checklist");
  } finally {
    await browser.close();
  }
});

test("L06 Fatia C: estoque, reserva, ativo/serial, entrega/devolução, requisição, compras sintéticas e auditoria fail-closed", { skip: !RUN, timeout: 180_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const comercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });

  const ast = (path, options) => api(`/api/ast${path}`, options);

  // Setup de empresa e contrato
  const companyId = uuid();
  await pool.query("INSERT INTO crm_companies (id, display_name, type, status, created_by) VALUES ($1, 'Empresa AST QA', 'client', 'active', 'admin')", [companyId]);
  const contractId = await insertContract(companyId, "ativo");

  // ==============================================================
  // 1. Autorização e Perfis
  // ==============================================================
  assert.equal((await ast("/products")).status, 401, "anonymous products read denied");
  assert.equal((await ast("/products", { cookie: comercial.cookie })).status, 403, "unauthorized role commercial denied");
  assert.equal((await ast("/products", { cookie: admin.cookie })).status, 200, "admin access allowed");

  // ==============================================================
  // 2. AST-01: Fornecedores e Produtos / SKU
  // ==============================================================
  const supRes = await ast("/suppliers", { cookie: admin.cookie, method: "POST", body: {
    name: "Fornecedor TechSeg Equipamentos",
    document: "11.222.333/0001-99",
    contact_name: "Carlos Fornecedor",
    contact_email: "carlos@techseg.com",
    address: "Av das Indústrias, 500, São Paulo SP",
    category: "equipamentos"
  } });
  assert.equal(supRes.status, 201, "supplier created");
  const supplierId = supRes.body.id;

  // Fornecedor com nome duplicado negado
  const dupSup = await ast("/suppliers", { cookie: admin.cookie, method: "POST", body: { name: "Fornecedor TechSeg Equipamentos" } });
  assert.equal(dupSup.status, 409, "duplicate supplier name rejected");

  const prodRes = await ast("/products", { cookie: admin.cookie, method: "POST", body: {
    sku: "RAD-VHF-001",
    name: "Rádio Comunicador VHF Digital",
    description: "Rádio comunicador profissional 16 canais com bateria de longa duração",
    category: "comunicacao",
    unit_measure: "UN",
    cost_cents: 25000,
    sale_price_cents: 45000,
    stock_min: 5,
    location: "Almoxarifado Central Prateleira B",
    supplier_id: supplierId
  } });
  assert.equal(prodRes.status, 201, "product created");
  const productId = prodRes.body.id;

  // SKU duplicado negado
  const dupProd = await ast("/products", { cookie: admin.cookie, method: "POST", body: {
    sku: "RAD-VHF-001",
    name: "Rádio Duplicado",
    description: "Tentativa de cadastrar mesmo SKU",
    category: "comunicacao",
    unit_measure: "UN"
  } });
  assert.equal(dupProd.status, 409, "duplicate SKU rejected");

  // ==============================================================
  // 3. AST-02: Movimentos de Estoque & Trava de Saldo Não-Negativo
  // ==============================================================
  // 3.1 Entrada inicial de 50 unidades
  const inMov = await ast("/stock-movements", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    movement_type: "entrada",
    quantity: 50,
    reason: "Entrada inicial de lote de compras",
    reference_type: "nota_fiscal",
    reference_id: "NF-98765"
  } });
  assert.equal(inMov.status, 201, "stock entry recorded");

  // Verifica saldo atual = 50
  let prodCheck = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [productId]);
  assert.equal(prodCheck.rows[0].stock_current, 50, "stock current updated to 50");

  // 3.2 Saída de 20 unidades
  const outMov = await ast("/stock-movements", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    movement_type: "saida",
    quantity: 20,
    reason: "Saída para implantação de postos operacionais",
    contract_id: contractId
  } });
  assert.equal(outMov.status, 201, "stock exit recorded");

  prodCheck = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [productId]);
  assert.equal(prodCheck.rows[0].stock_current, 30, "stock current updated to 30");

  // 3.3 Saída de 40 unidades (maior que o saldo disponível de 30) -> Bloqueado fail-closed (400)
  const overOut = await ast("/stock-movements", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    movement_type: "saida",
    quantity: 40,
    reason: "Tentativa de saída superior ao saldo",
    contract_id: contractId
  } });
  assert.equal(overOut.status, 400, "over-stock exit rejected");
  assert.equal(overOut.body.error, "insufficient_stock", "insufficient_stock error returned");

  // Saldo permanece intacto em 30
  prodCheck = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [productId]);
  assert.equal(prodCheck.rows[0].stock_current, 30, "stock remains 30 after rejected exit");

  // ==============================================================
  // 4. AST-03: Reservas para Proposta / Implantação
  // ==============================================================
  // 4.1 Reserva válida de 15 unidades para Proposta Comercial
  const resv1 = await ast("/reservations", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    quantity: 15,
    reservation_type: "proposta",
    reference_type: "proposta_comercial",
    reference_id: "PROP-2026-QA-01",
    contract_id: contractId
  } });
  assert.equal(resv1.status, 201, "valid reservation created");
  const resvId1 = resv1.body.id;

  // 4.2 Tentativa de reservar mais 20 unidades (disponível é 30 - 15 = 15) -> Bloqueada (400)
  const overResv = await ast("/reservations", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    quantity: 20,
    reservation_type: "implantacao",
    reference_type: "os_implantacao",
    reference_id: "OS-2026-QA-99"
  } });
  assert.equal(overResv.status, 400, "over-reservation rejected");
  assert.equal(overResv.body.error, "insufficient_available_stock");

  // 4.3 Retry idempotente da mesma reserva ativa rejeita duplicação (409)
  const dupResv = await ast("/reservations", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    quantity: 15,
    reservation_type: "proposta",
    reference_type: "proposta_comercial",
    reference_id: "PROP-2026-QA-01"
  } });
  assert.equal(dupResv.status, 409, "duplicate active reservation rejected");

  // 4.4 Liberação da reserva recompõe o saldo disponível exatamente uma vez
  const relRes = await ast("/reservations", { cookie: admin.cookie, method: "PATCH", body: { id: resvId1, action: "liberar" } });
  assert.equal(relRes.status, 200, "reservation released");
  assert.equal(relRes.body.status, "liberado");

  // Segunda chamada a liberar na mesma reserva é negada (não ativa)
  const reRelRes = await ast("/reservations", { cookie: admin.cookie, method: "PATCH", body: { id: resvId1, action: "liberar" } });
  assert.equal(reRelRes.status, 400, "re-releasing inactive reservation rejected");

  // 4.5 Conversão de reserva em saída definitiva
  const resv2 = await ast("/reservations", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    quantity: 10,
    reservation_type: "implantacao",
    reference_type: "contrato_implantacao",
    reference_id: "IMP-2026-QA-02",
    contract_id: contractId
  } });
  assert.equal(resv2.status, 201, "second reservation created");
  const resvId2 = resv2.body.id;

  const convRes = await ast("/reservations", { cookie: admin.cookie, method: "PATCH", body: { id: resvId2, action: "converter" } });
  assert.equal(convRes.status, 200, "reservation converted to exit");
  assert.equal(convRes.body.status, "convertido");

  // Saldo real cai de 30 para 20 após a conversão
  prodCheck = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [productId]);
  assert.equal(prodCheck.rows[0].stock_current, 20, "stock current decreased to 20 after conversion");

  // ==============================================================
  // 5. AST-04 e AST-05: Ativos Serializados e Custódia / Entregas
  // ==============================================================
  const assetRes = await ast("/serialized-assets", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    serial_number: "SER-RAD-2026-0001",
    owner_type: "proprio",
    owner_name: "Grupo SEG System Segurança",
    warranty_until: "2028-12-31",
    status: "disponivel",
    contract_id: contractId,
    notes: "Rádio novo revisado para operação"
  } });
  assert.equal(assetRes.status, 201, "serialized asset created");
  const assetId = assetRes.body.id;

  // Serial duplicado negado
  const dupAsset = await ast("/serialized-assets", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    serial_number: "SER-RAD-2026-0001",
    owner_type: "proprio",
    owner_name: "Grupo SEG System"
  } });
  assert.equal(dupAsset.status, 409, "duplicate serial number rejected");

  // 5.1 Entrega do ativo com termo de guarda
  const delivRes = await ast("/deliveries", { cookie: admin.cookie, method: "POST", body: {
    asset_id: assetId,
    delivery_type: "entrega",
    delivered_to_name: "Marcos Vigilante Titular",
    condition_before: "Equipamento novo sem avarias e bateria carregada",
    conference_notes: "Conferido com número de série e carregador completo"
  } });
  assert.equal(delivRes.status, 201, "asset delivery recorded");

  // Status do ativo passa para em_uso
  let assetCheck = await pool.query("SELECT status FROM ast_serialized_assets WHERE id=$1", [assetId]);
  assert.equal(assetCheck.rows[0].status, "em_uso", "asset status is em_uso");

  // 5.2 Tentativa de entregar ativo já em uso para outro colaborador é rejeitada (409)
  const doubleDeliv = await ast("/deliveries", { cookie: admin.cookie, method: "POST", body: {
    asset_id: assetId,
    delivery_type: "entrega",
    delivered_to_name: "Outro Colaborador Sem Devolução",
    condition_before: "Tentativa de dupla entrega ativa"
  } });
  assert.equal(doubleDeliv.status, 409, "double delivery of in-use asset rejected");

  // 5.3 Devolução do ativo recompõe status para disponivel
  const retDeliv = await ast("/deliveries", { cookie: admin.cookie, method: "POST", body: {
    asset_id: assetId,
    delivery_type: "devolucao",
    delivered_to_name: "Marcos Vigilante Titular",
    condition_after: "Equipamento íntegro devolvido ao almoxarifado",
    conference_notes: "Conferência de encerramento de plantão aprovada"
  } });
  assert.equal(retDeliv.status, 201, "asset return recorded");

  assetCheck = await pool.query("SELECT status FROM ast_serialized_assets WHERE id=$1", [assetId]);
  assert.equal(assetCheck.rows[0].status, "disponivel", "asset status returned to disponivel");

  // ==============================================================
  // 6. AST-06: Requisições e Compras Internas Sintéticas
  // ==============================================================
  const reqRes = await ast("/requisitions", { cookie: admin.cookie, method: "POST", body: {
    product_id: productId,
    quantity: 10,
    requester_name: "Supervisor Geral de Operações",
    urgency: "alta",
    reason: "Reposição emergencial para novos postos de vigilância",
    contract_id: contractId
  } });
  assert.equal(reqRes.status, 201, "requisition created");
  const requisitionId = reqRes.body.id;
  assert.match(reqRes.body.protocol, /^REQ-AST-/, "requisition protocol generated");

  // Aprovação com registro de responsável
  const appReq = await ast("/requisitions", { cookie: admin.cookie, method: "PATCH", body: { id: requisitionId, status: "aprovado", reason: "Aprovado pelo diretor operacional" } });
  assert.equal(appReq.status, 200, "requisition approved");

  // Cotação interna
  const quotRes = await ast("/quotations", { cookie: admin.cookie, method: "POST", body: {
    requisition_id: requisitionId,
    supplier_id: supplierId,
    unit_price_cents: 24000,
    total_price_cents: 240000,
    delivery_days: 3,
    notes: "Preço promocional para lote de 10 unidades"
  } });
  assert.equal(quotRes.status, 201, "quotation created");
  const quotationId = quotRes.body.id;

  // Selecionar cotação
  const selQuot = await ast("/quotations", { cookie: admin.cookie, method: "PATCH", body: { id: quotationId, is_selected: true } });
  assert.equal(selQuot.status, 200, "quotation selected");

  // Pedido de compra sintético
  const orderRes = await ast("/purchase-orders", { cookie: admin.cookie, method: "POST", body: {
    requisition_id: requisitionId,
    supplier_id: supplierId,
    total_amount_cents: 240000,
    notes: "Pedido sintético administrativo aprovado"
  } });
  assert.equal(orderRes.status, 201, "synthetic purchase order created");
  const orderId = orderRes.body.id;
  assert.match(orderRes.body.protocol, /^PED-AST-/, "purchase order protocol generated");

  // Recebimento total do pedido gera entrada automática no estoque do produto
  const recOrder = await ast("/purchase-orders", { cookie: admin.cookie, method: "PATCH", body: { id: orderId, status: "recebido_total", reason: "Mercadoria conferida e recebida no almoxarifado" } });
  assert.equal(recOrder.status, 200, "order received");

  // Saldo do produto sobe de 20 para 30 (+10 recebidas)
  prodCheck = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [productId]);
  assert.equal(prodCheck.rows[0].stock_current, 30, "stock increased to 30 after order reception");

  // Trilha imutável de requisições e pedidos preservada
  const reqHist = await ast(`/requisition-history?requisition_id=${requisitionId}`, { cookie: admin.cookie });
  assert.ok(reqHist.body.items.length >= 2, "requisition history recorded");

  const ordHist = await ast(`/order-history?order_id=${orderId}`, { cookie: admin.cookie });
  assert.ok(ordHist.body.items.length >= 2, "order history recorded");

  // ==============================================================
  // 7. Auditoria Fail-Closed em Patrimônio
  // ==============================================================
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_l06_c_bak");
  try {
    const auditMovFail = await ast("/stock-movements", { cookie: admin.cookie, method: "POST", body: {
      product_id: productId,
      movement_type: "entrada",
      quantity: 5,
      reason: "Entrada durante falha de auditoria"
    } });
    assert.equal(auditMovFail.status, 503, "stock movement fails closed when audit unavailable");

    // Confere que saldo NÃO alterou (permaneceu 30)
    prodCheck = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [productId]);
    assert.equal(prodCheck.rows[0].stock_current, 30, "stock unchanged on audit failure");
  } finally {
    await pool.query("ALTER TABLE audit_log_l06_c_bak RENAME TO audit_log");
  }

  // ==============================================================
  // 8. Chromium Real carrega `/admin/patrimonio` e valida abas
  // ==============================================================
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    await context.addCookies(admin.cookie.split("; ").map(pair => {
      const idx = pair.indexOf("=");
      return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: "127.0.0.1", path: "/" };
    }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/patrimonio`, { waitUntil: "networkidle" });

    // Título e tabela de produtos
    let content = await page.textContent("body");
    assert.match(content || "", /Patrimônio, Almoxarifado e Ativos/, "patrimonio workspace rendered");
    assert.match(content || "", /RAD-VHF-001/, "product SKU rendered in table");

    // Aba Reservas
    await page.click("button:has-text('Reservas Operacionais')");
    await page.waitForTimeout(500);
    content = await page.textContent("body");
    assert.match(content || "", /Reservas de Estoque/, "reservations tab rendered");

    // Aba Ativos Serializados
    await page.click("button:has-text('Ativos Serializados')");
    await page.waitForTimeout(500);
    content = await page.textContent("body");
    assert.match(content || "", /SER-RAD-2026-0001/, "serialized asset rendered");

    // Aba Requisições
    await page.click("button:has-text('Requisições Internas')");
    await page.waitForTimeout(500);
    content = await page.textContent("body");
    assert.match(content || "", /REQ-AST-/, "requisition protocol rendered");
  } finally {
    await browser.close();
  }
});

test("L06 Fatia D: inventário, ordens de serviço, manutenção, materiais, evidências privadas e auditoria fail-closed", { skip: !RUN, timeout: 180_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const comercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });

  const ast = (path, options) => api(`/api/ast${path}`, options);

  // Fixtures de contratos, empresas e documentos L02
  const companyA = uuid();
  await pool.query("INSERT INTO crm_companies (id, display_name, type, status, created_by) VALUES ($1, 'Empresa D Matriz', 'client', 'active', 'admin')", [companyA]);
  const contractA = await insertContract(companyA, "ativo");
  const clientAccA = uuid();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,'Cliente D Conta A','active','marcelo')", [clientAccA]);
  const clientContractA = uuid();
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,'Portal Contrato D A','manutencao','active','marcelo')", [clientContractA, clientAccA]);
  await pool.query("INSERT INTO crm_contract_portal_links (contract_id,client_contract_id,note) VALUES ($1,$2,'Vínculo portal D A QA')", [contractA, clientContractA]);
  const docA = uuid();
  await pool.query("INSERT INTO client_documents (id,client_account_id,contract_id,title,category,original_filename,content_type,size_bytes,storage_key,uploaded_by) VALUES ($1,$2,$3,'Laudo A','operacional','laudo_a.pdf','application/pdf',1,$4,'marcelo')", [docA, clientAccA, clientContractA, `qa${uuid().replaceAll("-", "").slice(0, 30)}`]);

  const companyB = uuid();
  await pool.query("INSERT INTO crm_companies (id, display_name, type, status, created_by) VALUES ($1, 'Empresa D Concorrente', 'client', 'active', 'admin')", [companyB]);
  const contractB = await insertContract(companyB, "ativo");
  const clientAccB = uuid();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,'Cliente D Conta B','active','marcelo')", [clientAccB]);
  const clientContractB = uuid();
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,'Portal Contrato D B','manutencao','active','marcelo')", [clientContractB, clientAccB]);
  await pool.query("INSERT INTO crm_contract_portal_links (contract_id,client_contract_id,note) VALUES ($1,$2,'Vínculo portal D B QA')", [contractB, clientContractB]);
  const docB = uuid();
  await pool.query("INSERT INTO client_documents (id,client_account_id,contract_id,title,category,original_filename,content_type,size_bytes,storage_key,uploaded_by) VALUES ($1,$2,$3,'Laudo B','operacional','laudo_b.pdf','application/pdf',1,$4,'marcelo')", [docB, clientAccB, clientContractB, `qa${uuid().replaceAll("-", "").slice(0, 30)}`]);

  // Produto para inventário e peças de OS
  const prodRes = await ast("/products", { cookie: admin.cookie, method: "POST", body: {
    sku: "CAM-IP-001",
    name: "Câmera Dome IP HD Infravermelho",
    description: "Câmera de segurança para monitoramento perimetral e manutenção de CFTV",
    category: "cftv",
    unit_measure: "UN",
    cost_cents: 35000,
    sale_price_cents: 60000,
    stock_min: 5
  } });
  assert.equal(prodRes.status, 201, "camera product created");
  const prodId = prodRes.body.id;

  // Entrada inicial de 30 unidades
  await ast("/stock-movements", { cookie: admin.cookie, method: "POST", body: {
    product_id: prodId,
    movement_type: "entrada",
    quantity: 30,
    reason: "Carga inicial de estoque para testes de OS e inventário"
  } });

  // Ativo serializado para manutenção
  const assetRes = await ast("/serialized-assets", { cookie: admin.cookie, method: "POST", body: {
    product_id: prodId,
    serial_number: "CAM-SN-2026-9001",
    owner_type: "cliente",
    owner_name: "Empresa D Matriz",
    contract_id: contractA,
    status: "em_uso"
  } });
  assert.equal(assetRes.status, 201, "camera asset created");
  const assetId = assetRes.body.id;

  // ==============================================================
  // 1. Autorização
  // ==============================================================
  console.log("Subtest 4: step 1 auth");
  assert.equal((await ast("/inventories")).status, 401, "anonymous inventories read denied");
  assert.equal((await ast("/inventories", { cookie: comercial.cookie })).status, 403, "commercial role inventories denied");
  assert.equal((await ast("/service-orders")).status, 401, "anonymous service orders read denied");
  assert.equal((await ast("/service-orders", { cookie: comercial.cookie })).status, 403, "commercial role service orders denied");

  // ==============================================================
  // 2. AST-07: Inventário Físico & Ajustes Aprovados
  // ==============================================================
  console.log("Subtest 4: step 2 inventory");
  const invRes = await ast("/inventories", { cookie: admin.cookie, method: "POST", body: {
    title: "Inventário Geral Almoxarifado Central Q4",
    description: "Contagem periódica e conciliação física de ativos de CFTV",
    location: "Almoxarifado CFTV Bloco 2",
    contract_id: contractA
  } });
  assert.equal(invRes.status, 201, "inventory created");
  const invId = invRes.body.id;
  assert.match(invRes.body.protocol, /^INV-AST-/, "inventory protocol generated");

  // Adiciona item com contagem física divergente: esperado 30, apurado 25 (ajuste -5)
  const itemRes = await ast("/inventory-items", { cookie: admin.cookie, method: "POST", body: {
    inventory_id: invId,
    product_id: prodId,
    expected_quantity: 30,
    counted_quantity: 25,
    adjustment_quantity: 25,
    adjustment_reason: "Ajuste por avaria física identificada em 5 unidades",
    is_approved: true
  } });
  assert.equal(itemRes.status, 201, "inventory item created");

  // Aprovação do inventário aplica a baixa atômica de 5 unidades
  const appInv = await ast("/inventories", { cookie: admin.cookie, method: "PATCH", body: {
    id: invId,
    status: "aprovado",
    reason: "Inventário conferido e aprovado pelo gerente de patrimônio"
  } });
  assert.equal(appInv.status, 200, "inventory approved");

  // Verifica que o saldo caiu de 30 para 25
  let checkStock = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [prodId]);
  assert.equal(checkStock.rows[0].stock_current, 25, "stock reduced to 25 after approved inventory adjustment");

  // Re-aprovação do mesmo inventário é rejeitada (idempotente)
  const reAppInv = await ast("/inventories", { cookie: admin.cookie, method: "PATCH", body: { id: invId, status: "aprovado" } });
  assert.equal(reAppInv.status, 400, "re-approving inventory rejected");

  // ==============================================================
  // 3. AST-08: Ordem de Serviço & Consumo Atômico de Peças
  // ==============================================================
  console.log("Subtest 4: step 3 os - creating OS");
  const soRes = await ast("/service-orders", { cookie: admin.cookie, method: "POST", body: {
    title: "Substituição de Câmeras Perimetrais com Falha",
    description: "Manutenção corretiva nas câmeras dome do portão leste",
    requester_name: "Gerente de Segurança Local",
    contract_id: contractA,
    priority: "alta",
    diagnosis: "Infiltração no conector e queima de circuito",
    parts: [{ product_id: prodId, quantity: 5 }]
  } });
  console.log("Subtest 4: step 3 os - created OS status", soRes.status);
  assert.equal(soRes.status, 201, "service order created");
  const soId = soRes.body.id;
  assert.match(soRes.body.protocol, /^OS-AST-/, "service order protocol generated");

  // Tentativa de concluir OS sem notas de execução rejeitada (400)
  console.log("Subtest 4: step 3 os - patch without notes");
  const conclNoNotes = await ast("/service-orders", { cookie: admin.cookie, method: "PATCH", body: {
    id: soId,
    status: "concluida",
    technician_name: "Técnico Especialista CFTV"
  } });
  console.log("Subtest 4: step 3 os - patch without notes status", conclNoNotes.status);
  assert.equal(conclNoNotes.status, 400, "completion without execution notes rejected");

  // Conclusão válida consome 5 peças do estoque de forma atômica
  console.log("Subtest 4: step 3 os - patch valid conclusion");
  const conclValid = await ast("/service-orders", { cookie: admin.cookie, method: "PATCH", body: {
    id: soId,
    status: "concluida",
    technician_name: "Técnico Especialista CFTV",
    execution_notes: "Câmeras substituídas com vedação reforçada e testadas com sucesso",
    parts: [{ product_id: prodId, quantity: 5 }]
  } });
  console.log("Subtest 4: step 3 os - patch valid conclusion status", conclValid.status);
  assert.equal(conclValid.status, 200, "service order concluded");
  assert.equal(conclValid.status, 200, "service order concluded");

  // Verifica que o saldo caiu de 25 para 20
  checkStock = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [prodId]);
  assert.equal(checkStock.rows[0].stock_current, 20, "stock reduced to 20 after OS completion");

  // Re-conclusão da mesma OS é rejeitada (não consome peças em duplicidade)
  const reConcl = await ast("/service-orders", { cookie: admin.cookie, method: "PATCH", body: {
    id: soId,
    status: "concluida",
    execution_notes: "Tentativa de re-execução"
  } });
  assert.equal(reConcl.status, 400, "re-concluding OS rejected");

  // OS exigindo mais peças que o saldo disponível falha sem efeito parcial
  const soExcess = await ast("/service-orders", { cookie: admin.cookie, method: "POST", body: {
    title: "OS com excesso de peças",
    description: "Tentativa de consumir 50 peças com apenas 20 em estoque",
    requester_name: "Supervisor Teste",
    contract_id: contractA,
    priority: "media"
  } });
  const soExcessId = soExcess.body.id;

  const conclExcess = await ast("/service-orders", { cookie: admin.cookie, method: "PATCH", body: {
    id: soExcessId,
    status: "concluida",
    technician_name: "Técnico Teste",
    execution_notes: "Tentativa de concluir OS com consumo excessivo",
    parts: [{ product_id: prodId, quantity: 50 }]
  } });
  assert.equal(conclExcess.status, 400, "completion with insufficient stock rejected");
  assert.equal(conclExcess.body.error, "insufficient_stock_for_parts");

  // Saldo permanece em 20
  checkStock = await pool.query("SELECT stock_current FROM ast_products WHERE id=$1", [prodId]);
  assert.equal(checkStock.rows[0].stock_current, 20, "stock remains 20 after rejected OS completion");

  // ==============================================================
  // 4. AST-09: Evidências Privadas com Validação de Escopo L02
  // ==============================================================
  // Documento de outro cliente/contrato rejeitado (403)
  const crossDocEvid = await ast("/service-order-evidences", { cookie: admin.cookie, method: "POST", body: {
    service_order_id: soId,
    client_document_id: docB,
    evidence_type: "foto_instalacao",
    file_name: "foto_camera_concorrente.jpg",
    before_after: "depois"
  } });
  assert.equal(crossDocEvid.status, 403, "cross-tenant private document evidence rejected");

  // Documento do mesmo cliente/contrato aceito
  const validEvid = await ast("/service-order-evidences", { cookie: admin.cookie, method: "POST", body: {
    service_order_id: soId,
    client_document_id: docA,
    evidence_type: "foto_instalacao",
    file_name: "foto_camera_instalada.jpg",
    before_after: "depois",
    is_client_visible: false
  } });
  assert.equal(validEvid.status, 201, "valid scoped evidence created");
  const evidId = validEvid.body.id;

  // Tornar visível ao cliente sem aprovação prévia rejeitado
  const visNoApp = await ast("/service-order-evidences", { cookie: admin.cookie, method: "PATCH", body: {
    id: evidId,
    is_client_visible: true,
    is_approved: false
  } });
  assert.equal(visNoApp.status, 400, "client visible requires approved evidence");

  // Aprovação com liberação para cliente
  const appEvid = await ast("/service-order-evidences", { cookie: admin.cookie, method: "PATCH", body: {
    id: evidId,
    is_approved: true,
    is_client_visible: true
  } });
  assert.equal(appEvid.status, 200, "evidence approved and made client-visible");

  // ==============================================================
  // 5. AST-10: Manutenção Preventiva / Corretiva & Execuções
  // ==============================================================
  const planRes = await ast("/maintenance-plans", { cookie: admin.cookie, method: "POST", body: {
    asset_id: assetId,
    maintenance_type: "preventiva",
    title: "Revisão Mensal de Lentes e Conectores CFTV",
    description: "Inspeção física, limpeza de cúpula e teste de infravermelho",
    periodicity_days: 30,
    next_due_date: "2026-11-15",
    contract_id: contractA
  } });
  assert.equal(planRes.status, 201, "maintenance plan created");
  const planId = planRes.body.id;

  const execRes = await ast("/maintenance-executions", { cookie: admin.cookie, method: "POST", body: {
    plan_id: planId,
    asset_id: assetId,
    executed_at: "2026-10-15",
    executed_by_name: "Técnico Especialista CFTV",
    result: "Câmera inspecionada, lentes calibradas e conectores isolados perfeitamente",
    next_due_date: "2026-11-15"
  } });
  assert.equal(execRes.status, 201, "maintenance execution recorded");

  // ==============================================================
  // 6. AST-11: Dossiê Técnico CFTV & Proteção contra Senhas em Texto Puro
  // ==============================================================
  // Tentativa de enviar senha em texto plano rejeitada (400)
  const plainPassRes = await ast("/cftv-dossiers", { cookie: admin.cookie, method: "POST", body: {
    location: "Portaria Principal",
    model: "Dome IP 4MP",
    plain_password: "SenhaInsegura123!",
    contract_id: contractA
  } });
  assert.equal(plainPassRes.status, 400, "plaintext password rejected");
  assert.equal(plainPassRes.body.error, "plaintext_password_prohibited");

  // Cadastro seguro com referência de senha
  const dosRes = await ast("/cftv-dossiers", { cookie: admin.cookie, method: "POST", body: {
    location: "Portaria Principal",
    model: "Dome IP 4MP",
    manufacturer: "Hikvision",
    serial_number: "HK-2026-0099",
    ip_address: "192.168.1.105",
    warranty_until: "2028-12-31",
    contract_id: contractA,
    password_reference: "VAULT-CFTV-KEY-0099",
    password_storage_hint: "Armazenado no cofre corporativo de TI chave 99",
    notes: "Câmera perimetral com zoom motorizado"
  } });
  assert.equal(dosRes.status, 201, "cftv dossier created with secure password reference");

  // ==============================================================
  // 7. AST-12: Materiais de Limpeza & Variância de Consumo
  // ==============================================================
  const cleanRes = await ast("/cleaning-materials", { cookie: admin.cookie, method: "POST", body: {
    product_id: prodId,
    location: "Posto Portaria A - Almoxarifado Limpeza",
    expected_consumption: 10,
    actual_consumption: 12,
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    needs_replacement: true,
    contract_id: contractA
  } });
  assert.equal(cleanRes.status, 201, "cleaning material consumption recorded");
  assert.equal(cleanRes.body.variance, 2, "variance correctly computed");

  // ==============================================================
  // 8. Auditoria Fail-Closed
  // ==============================================================
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_l06_d_bak");
  try {
    const auditOsFail = await ast("/service-orders", { cookie: admin.cookie, method: "POST", body: {
      title: "OS sem auditoria",
      description: "Tentativa de abertura de OS com trilha inativa",
      requester_name: "Supervisor Geral",
      contract_id: contractA
    } });
    assert.equal(auditOsFail.status, 503, "service order fails closed when audit unavailable");
  } finally {
    await pool.query("ALTER TABLE audit_log_l06_d_bak RENAME TO audit_log");
  }

  // ==============================================================
  // 9. Chromium Real carrega `/admin/patrimonio` e valida abas OS e Inventários
  // ==============================================================
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    await context.addCookies(admin.cookie.split("; ").map(pair => {
      const idx = pair.indexOf("=");
      return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: "127.0.0.1", path: "/" };
    }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/patrimonio`, { waitUntil: "networkidle" });

    // Aba OS
    await page.click("button:has-text('Ordens de Serviço (OS)')");
    await page.waitForTimeout(500);
    let content = await page.textContent("body");
    assert.match(content || "", /Substituição de Câmeras Perimetrais/, "service order rendered");

    // Aba Inventários
    await page.click("button:has-text('Inventários Físicos')");
    await page.waitForTimeout(500);
    content = await page.textContent("body");
    assert.match(content || "", /Inventário Geral Almoxarifado/, "inventory rendered");
  } finally {
    await browser.close();
  }
});


test("L06 Fatia E: OPS-09..16 — operação avançada, conflitos, idempotência, sintético e auditoria fail-closed", { skip: !RUN, timeout: 240_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const commercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });
  const companyId = uuid(), unitId = uuid();
  await pool.query("INSERT INTO crm_companies(id,display_name,type,status,created_by) VALUES($1,'Empresa Fatia E','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units(id,company_id,display_name,is_main) VALUES($1,$2,'Unidade Fatia E',true)", [unitId, companyId]);
  const contractId = await insertContract(companyId, "ativo");
  const supervisorId = await insertEmployee("ativo", "Supervisor Operacional");
  const executorId = await insertEmployee("ativo", "Auxiliar de Limpeza");

  assert.equal((await ops("/supervision-visits")).status, 401, "anonymous advanced operations denied");
  assert.equal((await ops("/keys", { cookie: commercial.cookie, method: "POST", body: {} })).status, 403, "unauthorized role denied");
  const postResponse = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: "Posto Fatia E", company_id: companyId, unit_id: unitId, contract_id: contractId, post_type: "vigilancia" } });
  assert.equal(postResponse.status, 201);
  const postId = postResponse.body.post.id;

  // OPS-09 — posto/contrato/supervisor ativos, score e plano verificado.
  const visit = await ops("/supervision-visits", { cookie: admin.cookie, method: "POST", body: { post_id: postId, supervisor_employee_id: supervisorId, scheduled_date: "2026-11-02", findings: "Apontamento sintético de inspeção" } });
  assert.equal(visit.status, 201);
  const visitId = visit.body.visit.id;
  assert.equal((await ops("/supervision-visits", { cookie: admin.cookie, method: "PATCH", body: { id: visitId, score: 101 } })).status, 400);
  const inspection = await ops("/supervision-inspections", { cookie: admin.cookie, method: "POST", body: { visit_id: visitId, title: "Inspeção operacional", score: 82, result: "Não conformidade localizada" } });
  assert.equal(inspection.status, 201);
  const plan = await ops("/supervision-action-plans", { cookie: admin.cookie, method: "POST", body: { visit_id: visitId, inspection_id: inspection.body.inspection.id, title: "Corrigir iluminação", description: "Substituir iluminação do acesso lateral", responsible_name: "Supervisor QA", due_date: "2026-11-10" } });
  assert.equal(plan.status, 201);
  assert.equal((await ops("/supervision-action-plans", { cookie: admin.cookie, method: "PATCH", body: { id: plan.body.actionPlan.id, status: "verificado" } })).status, 400);
  assert.equal((await ops("/supervision-action-plans", { cookie: admin.cookie, method: "PATCH", body: { id: plan.body.actionPlan.id, status: "verificado", verified_by: "Gestor QA" } })).status, 200);

  // OPS-10 — leitura sintética, localização indisponível, replay e idempotência.
  const patrol = await ops("/patrols", { cookie: admin.cookie, method: "POST", body: { post_id: postId, employee_id: supervisorId, patrol_date: "2026-11-02", route_name: "Rota sintética" } });
  assert.equal(patrol.status, 201);
  assert.match(patrol.body.synthetic_notice, /simulada/i);
  const patrolId = patrol.body.patrol.id;
  assert.equal((await ops("/patrol-readings", { cookie: admin.cookie, method: "POST", body: { patrol_id: patrolId, point_name: "Portão A", location_unavailable: true } })).status, 400);
  const reading = await ops("/patrol-readings", { cookie: admin.cookie, method: "POST", body: { patrol_id: patrolId, point_name: "Portão A", qr_code: "QR-FATIA-E", reading_key: "reading-1", location_unavailable: true, location_unavailable_reason: "Sensor sintético sem localização" } });
  assert.equal(reading.status, 201);
  assert.equal(reading.body.point.status, "localizacao_indisponivel");
  const retry = await ops("/patrol-readings", { cookie: admin.cookie, method: "POST", body: { patrol_id: patrolId, point_name: "Portão A", reading_key: "reading-1" } });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.idempotent, true);
  const replay = await ops("/patrol-readings", { cookie: admin.cookie, method: "POST", body: { patrol_id: patrolId, point_name: "Portão B", qr_code: "QR-FATIA-E", reading_key: "reading-2" } });
  assert.equal(replay.status, 201);
  assert.equal(replay.body.replay_detected, true);
  assert.equal(replay.body.point.replay_reason, "duplicate_qr");

  // OPS-11 — cadeia de custódia e dupla retirada incompatível.
  const key = await ops("/keys", { cookie: admin.cookie, method: "POST", body: { code: `KEY-${uuid().slice(0,8)}`, description: "Chave portão lateral", key_type: "chave", post_id: postId } });
  assert.equal(key.status, 201);
  const keyId = key.body.key.id;
  const withdrawalBody = { key_id: keyId, movement_type: "retirada", to_employee_id: supervisorId, reason: "Ronda sintética no perímetro lateral", purpose: "Acesso controlado ao portão" };
  assert.equal((await ops("/key-movements", { cookie: admin.cookie, method: "POST", body: withdrawalBody })).status, 201);
  assert.equal((await ops("/key-movements", { cookie: admin.cookie, method: "POST", body: withdrawalBody })).status, 409);
  assert.equal((await ops("/key-movements", { cookie: admin.cookie, method: "POST", body: { key_id: keyId, movement_type: "devolucao", reason: "Devolução após encerramento da ronda", purpose: "Retorno ao claviculário" } })).status, 201);

  // OPS-12 — fluxo estrito e liberação somente após aprovação.
  const report = await ops("/client-reports", { cookie: admin.cookie, method: "POST", body: { company_id: companyId, contract_id: contractId, post_id: postId, unit_id: unitId, report_type: "diario", period_start: "2026-11-01", period_end: "2026-11-01", title: "Livro diário operacional", content: "Conteúdo sintético revisável do livro de serviço diário." } });
  assert.equal(report.status, 201);
  const reportId = report.body.report.id;
  assert.equal((await ops("/client-reports", { cookie: admin.cookie, method: "PATCH", body: { id: reportId, status: "enviado" } })).status, 409);
  assert.equal((await ops("/client-reports", { cookie: admin.cookie, method: "PATCH", body: { id: reportId, status: "em_revisao", reviewed_by: "Revisor QA" } })).status, 200);
  assert.equal((await ops("/client-reports", { cookie: admin.cookie, method: "PATCH", body: { id: reportId, status: "aprovado", approved_by: "Diretor QA" } })).status, 200);
  assert.equal((await ops("/client-reports", { cookie: admin.cookie, method: "PATCH", body: { id: reportId, status: "enviado" } })).status, 200);

  // OPS-13 — fonte, janela, fórmula e incompletude explícitas.
  const definition = await ops("/metrics-definitions", { cookie: admin.cookie, method: "POST", body: { name: `Cobertura Fatia E ${uuid().slice(0,6)}`, metric_type: "cobertura", source: "cobertura", window_type: "diario", calculation_formula: "horas_cobertas / horas_previstas * 100" } });
  assert.equal(definition.status, 201);
  const definitionId = definition.body.definition.id;
  assert.equal((await ops("/metrics-snapshots", { cookie: admin.cookie, method: "POST", body: { definition_id: definitionId, period_start: "2026-11-01", period_end: "2026-11-01", completeness_status: "incompleto" } })).status, 400);
  const snapshot = await ops("/metrics-snapshots", { cookie: admin.cookie, method: "POST", body: { definition_id: definitionId, period_start: "2026-11-01", period_end: "2026-11-01", value: 75, unit: "%", completeness_status: "parcial", incompleteness_reason: "Uma integração ainda não forneceu dados" } });
  assert.equal(snapshot.status, 201);
  assert.equal(snapshot.body.snapshot.completeness_status, "parcial");

  // OPS-14 — sobreposição explícita impede publicação até resolução/revisão.
  const schedule = await ops("/assisted-schedules", { cookie: admin.cookie, method: "POST", body: { contract_id: contractId, unit_id: unitId, period_start: "2026-11-01", period_end: "2026-11-07" } });
  assert.equal(schedule.status, 201);
  const scheduleId = schedule.body.schedule.id;
  assert.equal((await ops("/assisted-schedule-entries", { cookie: admin.cookie, method: "POST", body: { proposal_id: scheduleId, post_id: postId, employee_id: supervisorId, entry_date: "2026-11-03" } })).status, 201);
  const conflictEntry = await ops("/assisted-schedule-entries", { cookie: admin.cookie, method: "POST", body: { proposal_id: scheduleId, post_id: postId, employee_id: supervisorId, entry_date: "2026-11-03" } });
  assert.equal(conflictEntry.status, 201);
  assert.ok(conflictEntry.body.conflicts.includes("sobreposicao"));
  assert.equal((await ops("/assisted-schedules", { cookie: admin.cookie, method: "PATCH", body: { id: scheduleId, status: "publicado", reviewed_by: "Gestor QA", motives: "Revisão humana documentada" } })).status, 409);

  // OPS-15 — ambiente, rotina, executor, inspeção e NC severa.
  const environment = await ops("/cleaning-environments", { cookie: admin.cookie, method: "POST", body: { post_id: postId, name: "Banheiro recepção", environment_type: "banheiro" } });
  assert.equal(environment.status, 201);
  const routine = await ops("/cleaning-routines", { cookie: admin.cookie, method: "POST", body: { environment_id: environment.body.environment.id, title: "Higienização diária", frequency: "diaria" } });
  assert.equal(routine.status, 201);
  const execution = await ops("/cleaning-executions", { cookie: admin.cookie, method: "POST", body: { routine_id: routine.body.routine.id, employee_id: executorId, score: 88, inspected_by: "Inspetor QA", quality_notes: "Qualidade verificada presencialmente apenas no cenário sintético" } });
  assert.equal(execution.status, 201);
  const nc = await ops("/cleaning-nonconformities", { cookie: admin.cookie, method: "POST", body: { execution_id: execution.body.execution.id, type: "qualidade", description: "Reposição de insumo pendente após inspeção", severity: "alta", responsible_name: "Líder QA" } });
  assert.equal(nc.status, 201);

  // OPS-16 — rótulo sintético obrigatório e transições reconhecido/tratado/encerrado.
  const connector = await ops("/monitoring-connectors", { cookie: admin.cookie, method: "POST", body: { name: `Conector sintético ${uuid().slice(0,6)}`, connector_type: "manual", is_synthetic: true } });
  assert.equal(connector.status, 201);
  assert.match(connector.body.synthetic_notice, /sintético/i);
  assert.equal((await ops("/monitoring-events", { cookie: admin.cookie, method: "POST", body: { event_type: "intrusao", occurred_at: new Date().toISOString(), is_synthetic: false } })).status, 400);
  const event = await ops("/monitoring-events", { cookie: admin.cookie, method: "POST", body: { connector_id: connector.body.connector.id, event_type: "panico_simulado", occurred_at: new Date().toISOString(), is_synthetic: true, post_id: postId } });
  assert.equal(event.status, 201);
  const eventId = event.body.event.id;
  assert.equal((await ops("/monitoring-events", { cookie: admin.cookie, method: "PATCH", body: { id: eventId, status: "reconhecido", acknowledged_by: "Operador QA" } })).status, 200);
  assert.equal((await ops("/monitoring-events", { cookie: admin.cookie, method: "PATCH", body: { id: eventId, status: "em_tratamento", treatment_notes: "Tratamento interno exclusivamente sintético" } })).status, 200);
  assert.equal((await ops("/monitoring-events", { cookie: admin.cookie, method: "PATCH", body: { id: eventId, status: "resolvido", treatment_notes: "Evento sintético encerrado sem despacho", closed_by: "Operador QA" } })).status, 200);

  // Auditoria indisponível: nenhuma mutação parcial.
  const code = `AUD-${uuid().slice(0,8)}`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_l06_e_bak");
  try {
    const failed = await ops("/keys", { cookie: admin.cookie, method: "POST", body: { code, description: "Chave sem trilha auditável", key_type: "chave", post_id: postId } });
    assert.equal(failed.status, 503);
    assert.equal(Number((await pool.query("SELECT count(*) n FROM ops_keys WHERE code=$1", [code])).rows[0].n), 0);
  } finally { await pool.query("ALTER TABLE audit_log_l06_e_bak RENAME TO audit_log"); }

  // Chromium real: seis abas da Fatia E e aviso sintético.
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    await context.addCookies(admin.cookie.split("; ").map(pair => { const i=pair.indexOf("="); return { name:pair.slice(0,i), value:pair.slice(i+1), domain:"127.0.0.1", path:"/" }; }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/operacao`, { waitUntil: "networkidle" });
    for (const label of ["Supervisão", "Rondas & Claviculário", "Relatórios", "Métricas & Escalas", "Limpeza", "Monitoramento Sintético"]) await page.getByRole("tab", { name: label, exact: true }).waitFor();
    await page.getByRole("tab", { name: "Monitoramento Sintético", exact: true }).click();
    assert.match((await page.textContent("body")) || "", /sem central 24h e sem despacho externo real/i);
  } finally { await browser.close(); }
});
