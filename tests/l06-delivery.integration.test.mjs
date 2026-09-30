// L06 (fatia A) — operação: estrutura/alocação e contrato encerrado, através de
// HTTP real, PostgreSQL descartável e Chromium. O SQL é usado apenas para montar
// fixtures sintéticas e para asserções diretas no banco.
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

async function insertContract(companyId, status) {
  const id = uuid();
  await pool.query(
    `INSERT INTO crm_contracts (id, proposal_id, proposal_version, company_id, title, status, origin, total_cost, total_price, idempotency_key, created_by)
     VALUES ($1, NULL, 1, $2, $3, $4, 'manual', 0, 0, $5, 'admin')`,
    [id, companyId, `Contrato QA L06 ${status}`, status, uuid()],
  );
  return id;
}
async function insertEmployee(status) {
  const id = uuid();
  await pool.query(
    `INSERT INTO hr_employees (id, matricula, display_name, cargo, status)
     VALUES ($1, $2, $3, 'Vigilante', $4)`,
    [id, `L06-${id.slice(0, 8)}`, `QA Funcionário ${status}`, status],
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
  server.stderr.on("data", chunk => { if (process.env.QA_VERBOSE === "1") process.stderr.write(chunk); });
  await waitForServer();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await sleep(250); server.kill("SIGKILL"); }
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

test("L06: alocação escopada por contrato, contrato encerrado bloqueia nova alocação, auditoria fail-closed", { skip: !RUN, timeout: 180_000 }, async () => {
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

  // 11. Chromium real carrega a área de negócio autenticada de operação.
  const browser = await chromium.launch({ executablePath: await packagedChromium.executablePath(), args: packagedChromium.args.filter(arg => arg !== "--disable-web-security"), headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(admin.cookie.split("; ").map(pair => {
      const idx = pair.indexOf("=");
      return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: "127.0.0.1", path: "/" };
    }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/operacao`, { waitUntil: "networkidle" });
    await page.waitForSelector("#posts-title", { timeout: 30_000 });
    const bodyText = await page.textContent("body");
    assert.match(bodyText || "", /Portaria Central/, "operations page renders synthetic posts via real API");
  } finally {
    await browser.close();
  }
});
