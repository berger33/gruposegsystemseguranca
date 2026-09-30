// L06 (fatias A, B e OPS-02) — operação: estrutura/alocação, contrato encerrado,
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

test("L06 OPS-01: cargo/função fora da borda de RH, necessidade por turno idempotente e cadeia cliente→posto", { skip: !RUN, timeout: 180_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const commercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const tag = uuid().slice(0, 8);

  const companyId = uuid();
  const unitId = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA OPS-01 Empresa','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'QA OPS-01 Unidade',true)", [unitId, companyId]);
  const contractActive = await insertContract(companyId, "ativo");
  const contractToClose = await insertContract(companyId, "ativo");

  // 1. Borda unificada (pendência registrada do OPS-01): o MESMO recurso
  //    responde igual no alias histórico e no canônico. Quem decide é o handler
  //    de operação (sessão de staff + papel + same-origin); a permissão de RH
  //    employees.read/write não é mais exigida para recurso de operação.
  //    Antes: admin/ti recebiam 403 no alias legado e 200 no canônico.
  assert.equal((await api("/api/hr/ops-job-roles")).status, 401, "anonymous denied on the legacy alias");
  assert.equal((await api("/api/hr/ops-job-roles", { cookie: admin.cookie })).status, 200, "admin reads job roles through the legacy alias (was 403 under the HR border)");
  assert.equal((await api("/api/admin/hr/ops-posts", { cookie: admin.cookie })).status, 200, "admin reads posts through the legacy alias");
  assert.equal((await api("/api/crm/hr/ops-schedule-versions", { cookie: admin.cookie })).status, 200, "admin reads schedule versions through the legacy alias");
  assert.equal((await api("/api/hr/ops-job-roles", { cookie: rh.cookie })).status, 200, "rh keeps access through the legacy alias");
  const legacyWrite = await api("/api/hr/ops-job-roles", { cookie: commercial.cookie, method: "POST", body: { name: `Negado ${tag}`, role_type: "cargo" } });
  assert.equal(legacyWrite.status, 403, "commercial cannot write through the legacy alias");
  assert.equal(legacyWrite.body.error, "forbidden", "the ops handler denies the write, not the HR border");
  // A borda de RH legada segue valendo para os paths de RH que não são de operação.
  assert.equal((await api("/api/hr/employees", { cookie: admin.cookie })).status, 403, "real HR path still requires the granular HR permission");

  // 2. Estrutura da cadeia: cargo/função em entidade própria, turno, posto.
  const role = await ops("/job-roles", { cookie: admin.cookie, method: "POST", body: { name: `Inspetor CFTV ${tag}`, role_type: "cargo", description: "Cargo sintético do gate OPS-01" } });
  assert.equal(role.status, 201, "job role created");
  const roleId = role.body.role.id;
  const shift = await ops("/shift-templates", { cookie: admin.cookie, method: "POST", body: { name: `Noturno 12h ${tag}`, shift_type: "noturno", start_time: "19:00", end_time: "07:00", duration_hours: 12 } });
  assert.equal(shift.status, 201, "shift template created");
  const shiftId = shift.body.template.id;
  const post = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: `Portaria OPS-01 ${tag}`, company_id: companyId, unit_id: unitId, contract_id: contractActive, post_type: "portaria" } });
  assert.equal(post.status, 201, "post created on the active contract");
  const postId = post.body.post.id;
  const postClosing = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: `Posto a encerrar ${tag}`, company_id: companyId, unit_id: unitId, contract_id: contractToClose, post_type: "portaria" } });
  assert.equal(postClosing.status, 201, "post on contract to be closed created");
  await pool.query("UPDATE crm_contracts SET status='encerrado' WHERE id=$1", [contractToClose]);

  // 3. Autorização e validação da necessidade por turno.
  assert.equal((await ops("/post-shift-needs", { method: "POST", body: { post_id: postId, shift_template_id: shiftId } })).status, 401, "anonymous cannot create need");
  assert.equal((await ops("/post-shift-needs", { cookie: commercial.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId } })).status, 403, "commercial cannot create need");
  assert.equal((await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, day_of_week: 7 } })).status, 400, "day out of range rejected");
  assert.equal((await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, required_headcount: 0 } })).status, 400, "zero headcount rejected");
  assert.equal((await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, required_headcount: 1.5 } })).status, 400, "fractional headcount rejected");

  // 4. Troca de ID devolve 404/409 nomeados, nunca colisão de FK; posto
  //    inativo e contrato encerrado não recebem nova necessidade.
  const needUnknownPost = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: uuid(), shift_template_id: shiftId } });
  assert.equal(needUnknownPost.status, 404, "unknown post rejected");
  assert.equal(needUnknownPost.body.error, "post_not_found");
  const needUnknownShift = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: uuid() } });
  assert.equal(needUnknownShift.status, 404, "unknown shift template rejected");
  assert.equal(needUnknownShift.body.error, "shift_template_not_found");
  const needUnknownRole = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, role_id: uuid() } });
  assert.equal(needUnknownRole.status, 404, "unknown job role rejected");
  assert.equal(needUnknownRole.body.error, "job_role_not_found");
  const needClosed = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postClosing.body.post.id, shift_template_id: shiftId } });
  assert.equal(needClosed.status, 409, "closed contract blocks new need");
  assert.equal(needClosed.body.error, "contract_not_operational");

  const postInactive = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: `Posto inativo ${tag}`, company_id: companyId, unit_id: unitId, contract_id: contractActive, post_type: "portaria" } });
  assert.equal(postInactive.status, 201, "post to deactivate created");
  assert.equal((await ops("/posts", { cookie: admin.cookie, method: "PATCH", body: { id: postInactive.body.post.id, is_active: false } })).status, 200, "post deactivated");
  const needInactive = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postInactive.body.post.id, shift_template_id: shiftId } });
  assert.equal(needInactive.status, 409, "inactive post blocks new need");
  assert.equal(needInactive.body.error, "post_inactive");

  // 5. Necessidade válida persistida; a leitura devolve os nomes canônicos da
  //    cadeia (posto, turno, cargo) para a tela renderizar sem segunda entidade.
  const need = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, role_id: roleId, day_of_week: 1, required_headcount: 2 } });
  assert.equal(need.status, 201, "valid need created");
  const readNeeds = await ops(`/post-shift-needs?post_id=${postId}`, { cookie: admin.cookie });
  assert.equal(readNeeds.status, 200, "needs listing works");
  const joinedNeed = (readNeeds.body.needs || []).find(item => item.id === need.body.need.id);
  assert.ok(joinedNeed, "created need is listed");
  assert.equal(joinedNeed.post_name, `Portaria OPS-01 ${tag}`, "need carries the canonical post name");
  assert.equal(joinedNeed.shift_template_name, `Noturno 12h ${tag}`, "need carries the shift template name");
  assert.equal(joinedNeed.role_name, `Inspetor CFTV ${tag}`, "need carries the job role name");

  // 6. Idempotência NULL-safe: a unicidade do banco é DISTINCT (NULLs não
  //    colidem), então repetir dia/cargo ausentes criava linha duplicada.
  //    A conferência explícita IS NOT DISTINCT FROM fecha o buraco.
  const dailyNeedBody = { post_id: postId, shift_template_id: shiftId, required_headcount: 1 };
  assert.equal((await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: dailyNeedBody })).status, 201, "need without day/role created");
  const dupNull = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: dailyNeedBody });
  assert.equal(dupNull.status, 409, "NULL-key duplicate rejected");
  assert.equal(dupNull.body.error, "duplicate_need");
  const dupExplicit = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, role_id: roleId, day_of_week: 1, required_headcount: 3 } });
  assert.equal(dupExplicit.status, 409, "explicit-key duplicate rejected");
  const needCount = await pool.query("SELECT count(*)::int AS n FROM ops_post_shift_needs WHERE post_id=$1", [postId]);
  assert.equal(needCount.rows[0].n, 2, "exactly two needs persisted for the post");

  // 7. Fail-closed de auditoria: sem trilha, a necessidade não é gravada.
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_ops01_bak");
  try {
    const beforeAudit = Number((await pool.query("SELECT count(*)::int AS n FROM ops_post_shift_needs WHERE post_id=$1", [postId])).rows[0].n);
    const auditFail = await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, day_of_week: 3 } });
    assert.equal(auditFail.status, 503, "need creation fails closed without audit");
    const afterAudit = Number((await pool.query("SELECT count(*)::int AS n FROM ops_post_shift_needs WHERE post_id=$1", [postId])).rows[0].n);
    assert.equal(afterAudit, beforeAudit, "no need persisted without audit trail");
  } finally {
    await pool.query("ALTER TABLE audit_log_ops01_bak RENAME TO audit_log");
  }
  assert.equal((await ops("/post-shift-needs", { cookie: admin.cookie, method: "POST", body: { post_id: postId, shift_template_id: shiftId, day_of_week: 3 } })).status, 201, "need persists again once audit is restored");
  const needTrail = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='ops_post_shift_need_create'");
  assert.ok(needTrail.rows[0].n >= 3, "need creations audited in the same transaction");

  // 8. A alocação fecha a cadeia e a leitura devolve posto e profissional.
  const employeeId = await insertEmployee("ativo");
  const allocation = await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postId, employee_id: employeeId, shift_template_id: shiftId, allocation_date: "2026-10-15" } });
  assert.equal(allocation.status, 201, "allocation closes the chain on the operational post");
  const readAllocs = await ops(`/allocations?post_id=${postId}`, { cookie: admin.cookie });
  const joinedAlloc = (readAllocs.body.allocations || []).find(item => item.id === allocation.body.allocation.id);
  assert.ok(joinedAlloc, "allocation listed");
  assert.equal(joinedAlloc.post_name, `Portaria OPS-01 ${tag}`, "allocation carries the post name");
  assert.ok(String(joinedAlloc.employee_name || "").startsWith("QA Funcionário"), "allocation carries the professional name");
  const readPosts = await ops("/posts?limit=100", { cookie: admin.cookie });
  const joinedPost = (readPosts.body.posts || []).find(item => item.id === postId);
  assert.ok(joinedPost, "post listed");
  assert.equal(joinedPost.company_name, "QA OPS-01 Empresa", "post carries the client name of the chain");
  assert.equal(joinedPost.unit_name, "QA OPS-01 Unidade", "post carries the served unit of the chain");

  // 9. Estado persistido para a verificação em Chromium real, feita na sessão
  //    de navegador já existente da Fatia B (evita um processo de navegador
  //    adicional só para esta aba).
  const uiState = await pool.query(
    `SELECT (SELECT count(*)::int FROM ops_post_shift_needs WHERE post_id=$1) AS needs,
            (SELECT count(*)::int FROM ops_allocations WHERE post_id=$1) AS allocs`,
    [postId]
  );
  assert.equal(uiState.rows[0].needs, 3, "needs remain persisted for the UI assertion");
  assert.equal(uiState.rows[0].allocs, 1, "allocation remains persisted for the UI assertion");
});

test("L06 OPS-02: dimensionamento valida valores e escopo canônico", { skip: !RUN, timeout: 180_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const tag = uuid().slice(0, 8);
  const companyId = uuid();
  const unitId = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA OPS-02 Empresa','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'QA OPS-02 Unidade',true)", [unitId, companyId]);
  const contractId = await insertContract(companyId, "ativo");
  const postId = uuid();
  await pool.query("INSERT INTO ops_posts (id,company_id,unit_id,contract_id,name,post_type,created_by) VALUES ($1,$2,$3,$4,'QA OPS-02 Posto','portaria','admin')", [postId, companyId, unitId, contractId]);

  const valid = await ops("/dimensioning", { cookie: admin.cookie, method: "POST", body: {
    company_id: companyId, unit_id: unitId, post_id: postId, contract_id: contractId,
    period_start: "2026-10-01", period_end: "2026-10-31",
    contracted_headcount: 4, planned_headcount: 4, realized_headcount: 3,
    coverage_hours_required: 744, coverage_hours_realized: 558,
  } });
  assert.equal(valid.status, 201, "valid dimensioning created");
  assert.equal(Number(valid.body.dimensioning.coverage_percent), 75, "coverage percent is derived by database");

  const invalidPeriod = await ops("/dimensioning", { cookie: admin.cookie, method: "POST", body: {
    post_id: postId, period_start: "not-a-date", period_end: "2026-10-31",
  } });
  assert.equal(invalidPeriod.status, 400, "invalid dates rejected");
  assert.equal(invalidPeriod.body.error, "invalid_period");

  const responsibleId = await insertEmployee("ativo");
  const gapWithResponsible = await ops("/coverage-gaps", { cookie: admin.cookie, method: "POST", body: {
    dimensioning_id: valid.body.dimensioning.id, post_id: postId, gap_date: "2026-10-05",
    gap_start: "2026-10-05T07:00:00Z", gap_end: "2026-10-05T09:00:00Z", uncovered_minutes: 120,
    responsible_id: responsibleId,
  } });
  assert.equal(gapWithResponsible.status, 201, "active responsible employee accepted");
  const terminatedResponsible = await insertEmployee("desligado");
  const invalidResponsible = await ops("/coverage-gaps", { cookie: admin.cookie, method: "POST", body: {
    dimensioning_id: valid.body.dimensioning.id, post_id: postId, gap_date: "2026-10-06",
    gap_start: "2026-10-06T07:00:00Z", gap_end: "2026-10-06T09:00:00Z", uncovered_minutes: 120,
    responsible_id: terminatedResponsible,
  } });
  assert.equal(invalidResponsible.status, 409, "inactive responsible employee rejected");
  assert.equal(invalidResponsible.body.error, "responsible_employee_not_operational");

  const gap = await ops("/coverage-gaps", { cookie: admin.cookie, method: "POST", body: {
    dimensioning_id: valid.body.dimensioning.id, post_id: postId, gap_date: "2026-10-04",
    gap_start: "2026-10-04T07:00:00Z", gap_end: "2026-10-04T09:00:00Z", uncovered_minutes: 120,
  } });
  assert.equal(gap.status, 201, "coverage gap in matching scope created");

  const otherPost = uuid();
  await pool.query("INSERT INTO ops_posts (id,company_id,unit_id,contract_id,name,post_type,created_by) VALUES ($1,$2,$3,$4,'QA OPS-02 Outro Posto','portaria','admin')", [otherPost, companyId, unitId, contractId]);
  const gapMismatch = await ops("/coverage-gaps", { cookie: admin.cookie, method: "POST", body: {
    dimensioning_id: valid.body.dimensioning.id, post_id: otherPost, gap_date: "2026-10-04",
    gap_start: "2026-10-04T07:00:00Z", gap_end: "2026-10-04T09:00:00Z", uncovered_minutes: 120,
  } });
  assert.equal(gapMismatch.status, 409, "coverage gap cannot cross post scope");
  assert.equal(gapMismatch.body.error, "dimensioning_post_mismatch");

  const invalidValues = await ops("/dimensioning", { cookie: admin.cookie, method: "POST", body: {
    post_id: postId, period_start: "2026-10-01", period_end: "2026-10-31", contracted_headcount: -1,
  } });
  assert.equal(invalidValues.status, 400, "negative values rejected");
  assert.equal(invalidValues.body.error, "invalid_dimensioning_values");

  const updated = await ops("/dimensioning", { cookie: admin.cookie, method: "PATCH", body: {
    id: valid.body.dimensioning.id, realized_headcount: 2, coverage_hours_realized: 372, status: "aprovado",
  } });
  assert.equal(updated.status, 200, "dimensioning update accepted");
  assert.equal(updated.body.dimensioning.realized_headcount, 2);

  const invalidPatch = await ops("/dimensioning", { cookie: admin.cookie, method: "PATCH", body: {
    id: valid.body.dimensioning.id, realized_headcount: 1.5,
  } });
  assert.equal(invalidPatch.status, 400, "fractional headcount update rejected");
  assert.equal(invalidPatch.body.error, "invalid_dimensioning_values");

  const otherCompany = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA OPS-02 Outra','client','active','admin')", [otherCompany]);
  const mismatch = await ops("/dimensioning", { cookie: admin.cookie, method: "POST", body: {
    company_id: otherCompany, post_id: postId, period_start: "2026-10-01", period_end: "2026-10-31",
  } });
  assert.equal(mismatch.status, 409, "company scope mismatch rejected");

  const closed = await insertContract(companyId, "encerrado");
  const closedPost = uuid();
  await pool.query("INSERT INTO ops_posts (id,company_id,unit_id,contract_id,name,post_type,created_by) VALUES ($1,$2,$3,$4,'QA OPS-02 Encerrado','portaria','admin')", [closedPost, companyId, unitId, closed]);
  const blocked = await ops("/dimensioning", { cookie: admin.cookie, method: "POST", body: {
    company_id: companyId, unit_id: unitId, post_id: closedPost, contract_id: closed,
    period_start: "2026-10-01", period_end: "2026-10-31",
  } });
  assert.equal(blocked.status, 409, "closed contract rejected");

  // ==============================================================
  // OPS-02 (fatia de fechamento): cobertura planejada versus realizada e
  // profissional HABILITADO. O painel recomputa a habilitação ATUAL contra as
  // alocações da faixa do registro, com a MESMA regra do motor OPS-04 — pega
  // qualificação revogada ou vencida DEPOIS da alocação, que o motor não viu
  // no momento da criação.
  // ==============================================================
  const roleDim = await ops("/job-roles", { cookie: admin.cookie, method: "POST", body: { name: `Vigilante Dim ${tag}`, role_type: "cargo", description: "Cargo sintético do cruzamento de habilitação" } });
  assert.equal(roleDim.status, 201, "job role for the cross created");
  const roleIdDim = roleDim.body.role.id;
  const shiftDim = await ops("/shift-templates", { cookie: admin.cookie, method: "POST", body: { name: `Comercial 8h ${tag}`, shift_type: "comercial", start_time: "08:00", end_time: "16:00", duration_hours: 8 } });
  assert.equal(shiftDim.status, 201, "shift template for the window created");

  const empQualified = await insertEmployee("ativo");
  const empNoRole = await insertEmployee("ativo");
  assert.equal((await ops("/qualifications", { cookie: admin.cookie, method: "POST", body: { employee_id: empQualified, role_id: roleIdDim, certification_type: `CFTV Dim ${tag}`, valid_until: "2028-12-31", is_valid: true } })).status, 201, "valid qualification registered");

  assert.equal((await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postId, employee_id: empQualified, shift_template_id: shiftDim.body.template.id, role_id: roleIdDim, allocation_date: "2026-10-10" } })).status, 201, "qualified allocation inside the window");
  assert.equal((await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postId, employee_id: empNoRole, shift_template_id: shiftDim.body.template.id, allocation_date: "2026-10-11" } })).status, 201, "allocation without role requirement inside the window");
  // Fora da faixa do registro: não pode entrar na conta do painel.
  assert.equal((await ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postId, employee_id: empNoRole, shift_template_id: shiftDim.body.template.id, allocation_date: "2026-11-15" } })).status, 201, "allocation outside the window created");

  const panel = await ops(`/dimensioning?post_id=${postId}`, { cookie: admin.cookie });
  assert.equal(panel.status, 200, "dimensioning panel read works");
  const panelRow = (panel.body.dimensionings || []).find(item => item.id === valid.body.dimensioning.id);
  assert.ok(panelRow, "dimensioning row listed for the post");
  assert.equal(panelRow.post_name, "QA OPS-02 Posto", "panel carries the canonical post name");
  assert.equal(panelRow.allocated_employees, 2, "two distinct professionals allocated inside the window (outside one excluded)");
  assert.equal(panelRow.qualified_employees, 1, "one professional with the required role satisfied by a valid qualification");
  assert.equal(panelRow.unqualified_employees, 0, "nobody with unmet requirement yet");
  assert.equal(panelRow.employees_without_requirement, 1, "one professional allocated only without role requirement");
  assert.equal(Number(panelRow.allocated_hours), 16, "hours summed from the shift templates of the window allocations");
  assert.equal(Number(panelRow.coverage_percent), 50, "planned versus realized coverage percent read from the record");

  // Habilitação revogada DEPOIS da alocação, pela API real (upsert de
  // qualificação): o painel expõe a degradação; dado incompleto vira lacuna
  // visível, não número fictício.
  assert.equal((await ops("/qualifications", { cookie: admin.cookie, method: "POST", body: { employee_id: empQualified, role_id: roleIdDim, certification_type: `CFTV Dim ${tag}`, valid_until: "2028-12-31", is_valid: false } })).status, 201, "qualification revoked via API after the allocation");
  const panelRevoked = await ops(`/dimensioning?post_id=${postId}`, { cookie: admin.cookie });
  const panelRowRevoked = (panelRevoked.body.dimensionings || []).find(item => item.id === valid.body.dimensioning.id);
  assert.equal(panelRowRevoked.qualified_employees, 0, "revoked qualification drops the qualified count");
  assert.equal(panelRowRevoked.unqualified_employees, 1, "professional with unmet requirement is exposed by the recomputation");

  // Lacunas de cobertura lidas com o nome canônico do posto.
  const gapsRead = await ops(`/coverage-gaps?post_id=${postId}`, { cookie: admin.cookie });
  assert.equal(gapsRead.status, 200, "coverage gaps read works");
  assert.ok((gapsRead.body.gaps || []).every(gap => gap.post_name === "QA OPS-02 Posto"), "gaps carry the canonical post name");

  // Estado persistido para a verificação em Chromium real, feita na sessão de
  // navegador já existente da Fatia B.
  const uiState = await pool.query(
    `SELECT (SELECT count(*)::int FROM ops_dimensioning WHERE post_id=$1) AS dims,
            (SELECT count(*)::int FROM ops_coverage_gaps WHERE post_id=$1) AS gaps`,
    [postId]
  );
  assert.ok(uiState.rows[0].dims >= 1, "dimensioning remains persisted for the UI assertion");
  assert.ok(uiState.rows[0].gaps >= 1, "coverage gaps remain persisted for the UI assertion");
});

test("L06 OPS-03: versões de escala validam período, status, sequência e histórico", { skip: !RUN, timeout: 180_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const companyId = uuid();
  const unitId = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA OPS-03 Empresa','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'QA OPS-03 Unidade',true)", [unitId, companyId]);

  const first = await ops("/schedule-versions", { cookie: admin.cookie, method: "POST", body: {
    company_id: companyId, unit_id: unitId, valid_from: "2026-11-01", valid_to: "2026-11-30",
  } });
  assert.equal(first.status, 201, "first schedule version created");
  assert.equal(first.body.version.version, 1);

  const second = await ops("/schedule-versions", { cookie: admin.cookie, method: "POST", body: {
    company_id: companyId, unit_id: unitId, valid_from: "2026-12-01", valid_to: "2026-12-31", status: "revisada",
  } });
  assert.equal(second.status, 201, "second schedule version created");
  assert.equal(second.body.version.version, 2, "version increments within scope");
  const shift = await ops("/shift-templates", { cookie: admin.cookie, method: "POST", body: { name: "QA OPS-03 Diurno", shift_type: "diurno", start_time: "07:00", end_time: "19:00", duration_hours: 12 } });
  assert.equal(shift.status, 201);
  const postId = uuid();
  await pool.query("INSERT INTO ops_posts (id,company_id,unit_id,name,post_type,created_by) VALUES ($1,$2,$3,'QA OPS-03 Posto','portaria','admin')", [postId, companyId, unitId]);
  const employeeId = await insertEmployee("ativo");
  const entryBody = { version_id: second.body.version.id, post_id: postId, employee_id: employeeId, shift_template_id: shift.body.template.id, entry_date: "2026-12-15" };
  const entry = await ops("/schedule-entries", { cookie: admin.cookie, method: "POST", body: entryBody });
  assert.equal(entry.status, 201, "schedule entry created within validity");
  const retryEntry = await ops("/schedule-entries", { cookie: admin.cookie, method: "POST", body: entryBody });
  assert.equal(retryEntry.status, 409, "schedule entry retry rejected");
  assert.equal(retryEntry.body.error, "duplicate_entry");

  const published = await ops("/schedule-versions", { cookie: admin.cookie, method: "PATCH", body: { id: second.body.version.id, status: "publicada" } });
  assert.equal(published.status, 200, "schedule publication accepted");
  const ack = await ops("/schedule-acks", { cookie: admin.cookie, method: "POST", body: { version_id: second.body.version.id, employee_id: employeeId, notes: "Ciente QA" } });
  assert.equal(ack.status, 201, "employee acknowledgment recorded");
  const ackRetry = await ops("/schedule-acks", { cookie: admin.cookie, method: "POST", body: { version_id: second.body.version.id, employee_id: employeeId } });
  assert.equal(ackRetry.status, 409, "acknowledgment retry rejected");

  const publishHistory = await pool.query("SELECT count(*)::int AS n FROM ops_schedule_history WHERE version_id=$1", [second.body.version.id]);
  assert.equal(publishHistory.rows[0].n, 2, "status transition history is persisted");
  const invalidPatchPeriod = await ops("/schedule-versions", { cookie: admin.cookie, method: "PATCH", body: { id: second.body.version.id, valid_from: "bad-date", valid_to: "2026-12-31" } });
  assert.equal(invalidPatchPeriod.status, 400, "invalid update period rejected");

  const history = await pool.query("SELECT count(*)::int AS n FROM ops_schedule_history WHERE version_id=$1", [second.body.version.id]);
  assert.equal(history.rows[0].n, 2, "creation and publication history are persisted");

  const invalidDate = await ops("/schedule-versions", { cookie: admin.cookie, method: "POST", body: {
    company_id: companyId, unit_id: unitId, valid_from: "bad-date", valid_to: "2026-12-31",
  } });
  assert.equal(invalidDate.status, 400, "invalid schedule dates rejected");

  const invalidStatus = await ops("/schedule-versions", { cookie: admin.cookie, method: "POST", body: {
    company_id: companyId, unit_id: unitId, valid_from: "2027-01-01", valid_to: "2027-01-31", status: "publicadao",
  } });
  assert.equal(invalidStatus.status, 400, "invalid schedule status rejected");
});

test("L06 OPS-04: habilitação, documentação, indisponibilidade, jornada e descanso sob regra aprovada", { skip: !RUN, timeout: 300_000 }, async () => {
  const admin = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const commercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });
  const tag = uuid().slice(0, 8);

  const companyId = uuid();
  const unitId = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA OPS-04 Empresa','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'QA OPS-04 Unidade',true)", [unitId, companyId]);
  const contractActive = await insertContract(companyId, "ativo");

  // 1. Autorização: a borda é a API, não o React. Anônimo e papel indevido não
  //    configuram regra de jornada nem habilitação.
  assert.equal((await ops("/work-rules", { method: "POST", body: { name: `X ${tag}` } })).status, 401, "anonymous cannot create work rule");
  assert.equal((await ops("/work-rules", { cookie: commercial.cookie, method: "POST", body: { name: `X ${tag}` } })).status, 403, "commercial cannot create work rule");
  assert.equal((await ops("/qualifications", { method: "POST", body: { employee_id: uuid(), certification_type: "CNV" } })).status, 401, "anonymous cannot create qualification");
  assert.equal((await ops("/qualifications", { cookie: commercial.cookie, method: "POST", body: { employee_id: uuid(), certification_type: "CNV" } })).status, 403, "commercial cannot create qualification");

  const post = await ops("/posts", { cookie: admin.cookie, method: "POST", body: { name: `Posto OPS-04 ${tag}`, company_id: companyId, unit_id: unitId, contract_id: contractActive, post_type: "portaria" } });
  assert.equal(post.status, 201, "OPS-04 post created");
  const postId = post.body.post.id;

  const mkShift = async (name, type, start, end, hours) => {
    const created = await ops("/shift-templates", { cookie: admin.cookie, method: "POST", body: { name, shift_type: type, start_time: start, end_time: end, duration_hours: hours } });
    assert.equal(created.status, 201, `shift ${name} created`);
    return created.body.template.id;
  };
  const manha4 = await mkShift(`M4 ${tag}`, "comercial", "08:00", "12:00", 4);
  const tarde5 = await mkShift(`T5 ${tag}`, "diurno", "13:00", "18:00", 5);
  const dia12 = await mkShift(`D12 ${tag}`, "12x36_dia", "07:00", "19:00", 12);
  const madrugada4 = await mkShift(`MD4 ${tag}`, "madrugada", "05:00", "09:00", 4);

  // 2026-03-02 é segunda-feira: fixa a semana ISO usada na jornada semanal.
  const D0 = "2027-03-01", D1 = "2027-03-02", D2 = "2027-03-03";
  const allocate = (employee_id, shift_template_id, allocation_date, extra = {}) =>
    ops("/allocations", { cookie: admin.cookie, method: "POST", body: { post_id: postId, employee_id, shift_template_id, allocation_date, ...extra } });

  // 2. O limite legal de descanso de uma escala 12x36 é 36h. A API recusava
  //    qualquer valor acima de 24h, tornando a própria regra semeada
  //    inconfigurável; o CHECK do banco sempre admitiu até 168h.
  const rule36 = await ops("/work-rules", { cookie: admin.cookie, method: "POST", body: { name: `QA 12x36 ${tag}`, description: "Regra sintética de descanso 36h para validação", min_rest_hours: 36, max_daily_hours: 12 } });
  assert.equal(rule36.status, 201, "36h rest rule accepted (DB CHECK allows up to 168h)");
  assert.equal(Number(rule36.body.rule.min_rest_hours), 36);

  // 3. Zero é um valor configurado, não "ausente": o padrão não pode
  //    sobrescrever o que o responsável definiu.
  const ruleCreated = await ops("/work-rules", { cookie: admin.cookie, method: "POST", body: {
    name: `QA OPS-04 Jornada ${tag}`, description: "Regra sintética de jornada para o gate OPS-04",
    max_daily_hours: 8, min_rest_hours: 0, max_consecutive_days: 30, max_weekly_hours: 80,
  } });
  assert.equal(ruleCreated.status, 201, "work rule created");
  assert.equal(Number(ruleCreated.body.rule.min_rest_hours), 0, "min_rest_hours=0 is preserved, not replaced by default");
  assert.equal(ruleCreated.body.rule.is_approved, false, "rule starts unapproved");
  const ruleId = ruleCreated.body.rule.id;
  const patchRule = payload => ops("/work-rules", { cookie: admin.cookie, method: "PATCH", body: { id: ruleId, ...payload } });

  // 4. Sem regra APROVADA E ATIVA nada é presumido: a jornada não é inventada.
  const empNoRule = await insertEmployee("ativo");
  const free1 = await allocate(empNoRule, manha4, D0);
  assert.equal(free1.status, 201, "allocation allowed while no approved rule exists");
  assert.equal(free1.body.validation.work_rule_applied, false, "response states journey rules were not applied");
  assert.equal((await allocate(empNoRule, tarde5, D0)).status, 201, "9h/day allowed: no approved rule to exceed");

  // 5. Aprovação é ato de governança e vai auditada na mesma transação.
  const approved = await patchRule({ is_approved: true });
  assert.equal(approved.status, 200, "rule approved");
  assert.equal(approved.body.rule.is_approved, true);
  assert.ok(approved.body.rule.approved_by, "approval records who approved");
  const ruleTrail = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='ops_work_rule_update' AND target=$1", [ruleId]);
  assert.equal(ruleTrail.rows[0].n, 1, "rule approval is audited");

  // 6. Jornada diária máxima passa a bloquear, com limite e projeção explícitos.
  const empDaily = await insertEmployee("ativo");
  const dailyOk = await allocate(empDaily, manha4, D0);
  assert.equal(dailyOk.status, 201, "4h within the 8h approved limit");
  assert.equal(dailyOk.body.validation.work_rule_applied, true, "approved rule is reported as applied");
  assert.equal(dailyOk.body.validation.max_daily_hours, 8);
  const dailyBlocked = await allocate(empDaily, tarde5, D0);
  assert.equal(dailyBlocked.status, 422, "4h + 5h exceeds the 8h daily limit");
  assert.equal(dailyBlocked.body.error, "max_daily_hours_exceeded");
  assert.equal(dailyBlocked.body.limit_hours, 8);
  assert.equal(dailyBlocked.body.projected_hours, 9);
  assert.equal(await allocationCount(empDaily), 1, "refused journey leaves no partial effect");

  // 7. Descanso mínimo entre jornadas, medido em horas reais entre turnos.
  assert.equal((await patchRule({ max_daily_hours: 24, min_rest_hours: 11 })).status, 200, "rule switched to rest scenario");
  const empRest = await insertEmployee("ativo");
  assert.equal((await allocate(empRest, dia12, D0)).status, 201, "12h shift ending 19:00 allocated");
  const restBlocked = await allocate(empRest, madrugada4, D1);
  assert.equal(restBlocked.status, 422, "only 10h between 19:00 and 05:00 next day");
  assert.equal(restBlocked.body.error, "min_rest_hours_violated");
  assert.equal(restBlocked.body.required_rest_hours, 11);
  assert.equal(restBlocked.body.observed_rest_hours, 10);
  assert.equal(await allocationCount(empRest), 1, "rest violation creates no row");
  assert.equal((await allocate(empRest, tarde5, D1)).status, 201, "18h of rest satisfies the approved minimum");

  // 8. Jornada semanal na semana ISO que contém a data.
  assert.equal((await patchRule({ max_weekly_hours: 16 })).status, 200, "weekly limit lowered");
  const weeklyBlocked = await allocate(empRest, manha4, D2);
  assert.equal(weeklyBlocked.status, 422, "12h + 5h + 4h exceeds the 16h weekly limit");
  assert.equal(weeklyBlocked.body.error, "max_weekly_hours_exceeded");
  assert.equal(weeklyBlocked.body.projected_hours, 21);

  // 9. Dias consecutivos de trabalho.
  assert.equal((await patchRule({ max_weekly_hours: 80, max_consecutive_days: 2 })).status, 200, "consecutive-day limit lowered");
  const consecutiveBlocked = await allocate(empRest, manha4, D2);
  assert.equal(consecutiveBlocked.status, 422, "third consecutive day exceeds the approved limit");
  assert.equal(consecutiveBlocked.body.error, "max_consecutive_days_exceeded");
  assert.equal(consecutiveBlocked.body.projected_days, 3);
  assert.equal(await allocationCount(empRest), 2, "no row created by weekly/consecutive refusals");

  // 10. Habilitação e documentação. A checagem anterior nunca bloqueava: o
  //     registro de diagnóstico violava chk_version_or_entry, a exceção era
  //     engolida e a alocação seguia em frente.
  assert.equal((await patchRule({ max_daily_hours: 24, min_rest_hours: 0, max_weekly_hours: 80, max_consecutive_days: 30 })).status, 200, "rule relaxed for qualification scenario");
  const role = await ops("/job-roles", { cookie: admin.cookie, method: "POST", body: { name: `Vigilante QA ${tag}`, role_type: "cargo", description: "Cargo sintético do gate OPS-04 para validar habilitação" } });
  assert.equal(role.status, 201, "job role created");
  const roleId = role.body.role.id;
  const empQual = await insertEmployee("ativo");

  const missing = await allocate(empQual, dia12, D0, { role_id: roleId });
  assert.equal(missing.status, 422, "role without registered qualification is blocked");
  assert.equal(missing.body.error, "qualification_required");
  assert.equal(await allocationCount(empQual), 0, "unqualified professional is not allocated");

  const putQual = payload => ops("/qualifications", { cookie: admin.cookie, method: "POST", body: { employee_id: empQual, role_id: roleId, certification_type: `CNV ${tag}`, ...payload } });
  assert.equal((await putQual({ valid_until: "2026-01-31" })).status, 201, "expired qualification registered");
  const expired = await allocate(empQual, dia12, D0, { role_id: roleId });
  assert.equal(expired.status, 422, "expired documentation is blocked");
  assert.equal(expired.body.error, "qualification_expired");

  assert.equal((await putQual({ valid_until: "2028-12-31", is_valid: false })).status, 201, "qualification marked invalid");
  const invalid = await allocate(empQual, dia12, D0, { role_id: roleId });
  assert.equal(invalid.status, 422, "invalid qualification is blocked");
  assert.equal(invalid.body.error, "qualification_invalid");

  assert.equal((await putQual({ valid_until: "2028-12-31", is_valid: true })).status, 201, "valid qualification registered");
  const qualified = await allocate(empQual, dia12, D0, { role_id: roleId });
  assert.equal(qualified.status, 201, "qualified professional is allocated");
  assert.equal(await allocationCount(empQual), 1, "exactly one allocation after three refusals");
  assert.equal((await allocate(empQual, dia12, D0, { role_id: roleId })).status, 409, "retry does not duplicate");
  assert.equal(await allocationCount(empQual), 1, "retry left no second row");

  // 11. Regra aprovada que exige certificação torna o cargo obrigatório —
  //     o sistema não escolhe uma função pelo profissional.
  const certRule = await ops("/work-rules", { cookie: admin.cookie, method: "POST", body: {
    name: `QA OPS-04 Certificação ${tag}`, description: "Regra sintética que exige certificação explícita",
    max_daily_hours: 24, min_rest_hours: 0, max_consecutive_days: 30, max_weekly_hours: 80,
    requires_certification: true, is_approved: true,
  } });
  assert.equal(certRule.status, 201, "certification-requiring rule created and approved");
  const empCert = await insertEmployee("ativo");
  const noRole = await allocate(empCert, manha4, D0);
  assert.equal(noRole.status, 422, "approved rule requires an explicit role to validate");
  assert.equal(noRole.body.error, "role_required_by_work_rule");
  assert.equal((await ops("/work-rules", { cookie: admin.cookie, method: "PATCH", body: { id: certRule.body.rule.id, is_active: false } })).status, 200, "certification rule deactivated");
  assert.equal((await allocate(empCert, manha4, D0)).status, 201, "inactive rule stops being enforced");

  // 12. Indisponibilidade declarada em RH bloqueia; ausência rejeitada não.
  const empAway = await insertEmployee("ativo");
  const absenceId = uuid();
  await pool.query(
    `INSERT INTO hr_absences (id, employee_id, type, start_date, end_date, status, reason, created_by)
     VALUES ($1,$2,'atestado_medico',$3,$4,'aprovado','Afastamento sintético QA','admin')`,
    [absenceId, empAway, D0, D2],
  );
  const unavailable = await allocate(empAway, manha4, D1);
  assert.equal(unavailable.status, 409, "employee on registered absence is not scheduled");
  assert.equal(unavailable.body.error, "employee_unavailable");
  assert.equal(unavailable.body.absence_status, "aprovado");
  assert.equal(unavailable.body.absence_id, absenceId);
  assert.equal(await allocationCount(empAway), 0, "unavailable professional gets no allocation");

  const empRejected = await insertEmployee("ativo");
  await pool.query(
    `INSERT INTO hr_absences (id, employee_id, type, start_date, end_date, status, reason, created_by)
     VALUES ($1,$2,'falta_justificada',$3,$4,'rejeitado','Pedido recusado QA','admin')`,
    [uuid(), empRejected, D0, D2],
  );
  assert.equal((await allocate(empRejected, manha4, D1)).status, 201, "rejected absence must not block scheduling");

  // 13. Escala (OPS-03/OPS-04): as mesmas regras valem na entrada de escala.
  const version = await ops("/schedule-versions", { cookie: admin.cookie, method: "POST", body: { company_id: companyId, unit_id: unitId, valid_from: D0, valid_to: "2027-03-31" } });
  assert.equal(version.status, 201, "schedule version created");
  const versionId = version.body.version.id;
  const entry = (employee_id, shift_template_id, entry_date, extra = {}) =>
    ops("/schedule-entries", { cookie: admin.cookie, method: "POST", body: { version_id: versionId, post_id: postId, employee_id, shift_template_id, entry_date, ...extra } });

  assert.equal((await entry(await insertEmployee("desligado"), manha4, D0)).status, 409, "terminated employee rejected in schedule");
  const strangerPost = await ops("/schedule-entries", { cookie: admin.cookie, method: "POST", body: { version_id: versionId, post_id: uuid(), employee_id: empQual, shift_template_id: manha4, entry_date: D0 } });
  assert.equal(strangerPost.status, 404, "unknown post rejected in schedule (no FK collision)");

  const empEntry = await insertEmployee("ativo");
  assert.equal((await entry(empEntry, manha4, D0, { role_id: roleId })).status, 422, "schedule entry needs a valid qualification too");
  const entryOk = await entry(empEntry, manha4, D0);
  assert.equal(entryOk.status, 201, "schedule entry created");
  assert.equal((await entry(empEntry, manha4, D0)).status, 409, "schedule entry retry rejected");
  const overlapEntry = await entry(empEntry, dia12, D0);
  assert.equal(overlapEntry.status, 409, "overlapping shift on the same day rejected in schedule");
  assert.equal(overlapEntry.body.error, "overlap_detected");
  const entryRows = await pool.query("SELECT count(*)::int AS n FROM ops_schedule_entries WHERE employee_id=$1", [empEntry]);
  assert.equal(entryRows.rows[0].n, 1, "retry and overlap left a single schedule entry");
  const positive = await pool.query("SELECT count(*)::int AS n FROM ops_schedule_validations WHERE entry_id=$1 AND is_valid=true", [entryOk.body.entry.id]);
  assert.equal(positive.rows[0].n, 1, "positive validation stored with the entry");
  const entryTrail = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='ops_schedule_entry_create' AND target=$1", [entryOk.body.entry.id]);
  assert.equal(entryTrail.rows[0].n, 1, "schedule entry audited in the same transaction");
  const refusalTrail = await pool.query("SELECT count(*)::int AS n FROM ops_schedule_validations WHERE version_id=$1 AND is_valid=false", [versionId]);
  assert.ok(refusalTrail.rows[0].n >= 2, "schedule refusals are recorded as invalid validations");

  // 14. Auditoria indisponível: nega sem efeito parcial, nos dois caminhos.
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_ops04_bak");
  try {
    const beforeAlloc = await allocationCount(empEntry);
    assert.equal((await allocate(empEntry, tarde5, D2)).status, 503, "allocation fails closed without audit");
    assert.equal(await allocationCount(empEntry), beforeAlloc, "no allocation persisted without audit trail");
    const beforeEntries = (await pool.query("SELECT count(*)::int AS n FROM ops_schedule_entries WHERE employee_id=$1", [empEntry])).rows[0].n;
    assert.equal((await entry(empEntry, tarde5, D2)).status, 503, "schedule entry fails closed without audit");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM ops_schedule_entries WHERE employee_id=$1", [empEntry])).rows[0].n, beforeEntries, "no schedule entry persisted without audit trail");
    assert.equal((await patchRule({ max_daily_hours: 10 })).status, 503, "work rule change fails closed without audit");
    const unchanged = await pool.query("SELECT max_daily_hours FROM ops_work_rules WHERE id=$1", [ruleId]);
    assert.equal(Number(unchanged.rows[0].max_daily_hours), 24, "rule limit unchanged without audit trail");
  } finally {
    await pool.query("ALTER TABLE audit_log_ops04_bak RENAME TO audit_log");
  }
  assert.equal((await allocate(empEntry, tarde5, D2)).status, 201, "allocation persists again once audit is restored");

  // 15. A regra aprovada e a habilitação ficam persistidas para a verificação
  //     em Chromium real, feita na sessão de navegador já existente da Fatia B
  //     (evita um quarto processo de navegador só para esta aba).
  const uiState = await pool.query(
    `SELECT (SELECT count(*)::int FROM ops_work_rules WHERE is_approved=true AND is_active=true) AS enforcing,
            (SELECT count(*)::int FROM ops_employee_qualifications WHERE is_valid=true) AS valid_quals`
  );
  assert.ok(uiState.rows[0].enforcing >= 1, "an approved and active rule remains for the UI assertion");
  assert.ok(uiState.rows[0].valid_quals >= 1, "a valid qualification remains for the UI assertion");
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

    // OPS-01: cadeia cliente → unidade → posto → necessidade por turno →
    // alocação, criada no subteste OPS-01 e renderizada da API real. O grupo de
    // estrutura tem carregamento próprio; esperar a seção garante que terminou.
    await page.waitForSelector("#shift-needs-title", { timeout: 30_000 });
    content = await page.textContent("body");
    assert.match(content || "", /QA OPS-01 Empresa/, "posts table renders the client of the chain");
    assert.match(content || "", /QA OPS-01 Unidade/, "posts table renders the served unit of the chain");
    assert.match(content || "", /Inspetor CFTV/, "job roles section renders the OPS-01 entity");
    assert.match(content || "", /Noturno 12h/, "shift need renders the canonical shift template name");
    assert.match(content || "", /Portaria OPS-01/, "shift need row carries the post name via the canonical join");
    assert.match(content || "", /sem dia específico/, "need without a day is shown without inventing semantics");
    assert.match(content || "", /QA Funcionário ativo/, "allocations table renders the professional of the chain");

    // Aba Dimensionamento (OPS-02): contratado × planejado × realizado por
    // faixa de tempo, com habilitação cruzada recomputada e fórmula explícita.
    await page.click("button:has-text('Dimensionamento (OPS-02)')");
    await page.waitForSelector("#dimensioning-title", { timeout: 30_000 });
    content = await page.textContent("body");
    assert.match(content || "", /QA OPS-02 Posto/, "dimensioning tab renders the post of the chain");
    assert.match(content || "", /50%/, "coverage percent rendered from the real record");
    assert.match(content || "", /sem habilitação válida/, "revoked qualification exposed as a visible gap");
    assert.match(content || "", /horas realizadas ÷ horas exigidas/, "panel footer states the explicit formula and period");
    assert.match(content || "", /Lacunas de cobertura/, "coverage gaps section rendered");
    assert.match(content || "", /2026-10-05/, "gap date rendered from the real API");

    // Aba Jornada & Habilitação (OPS-04): regra aprovada, habilitação e trilha
    // de bloqueios, vindos da API real e persistidos pelo subteste OPS-04.
    await page.click("button:has-text('Jornada & Habilitação (OPS-04)')");
    await page.waitForSelector("#work-rules-title", { timeout: 30_000 });
    content = await page.textContent("body");
    assert.match(content || "", /QA OPS-04 Jornada/, "approved work rule rendered from the real API");
    assert.match(content || "", /aprovada e aplicada/, "screen distinguishes an enforced rule");
    assert.match(content || "", /Habilitação e documentação/, "qualification section rendered");
    assert.match(content || "", /Bloqueios registrados/, "refusal trail section rendered");

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
