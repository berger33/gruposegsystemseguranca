// EXT-10 / F06 — PostgreSQL 17 descartável + servidor HTTP real + navegador real.
// SQL prepara somente identidades, credenciais, grants e controles de teste;
// planos, transições e exercícios nascem exclusivamente por HTTP canônico.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium as playwrightChromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT10_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const uuid = () => randomUUID();
const key = (name) => `ext10-${name}-${uuid()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchTimeout = (url, init = {}) => fetch(url, {
  ...init,
  signal: AbortSignal.timeout(init.method && init.method !== "GET" ? 60000 : 30000),
});

let server;
let base;
let pool;
let logs = "";
let admin;
let ti;
let rh;
let cookieAdmin;
let cookieTi;
let cookieRh;
let planA;
let planB;
let browserPlan;
const sessionSecret = randomUUID().repeat(2);

async function createStaff(role, tag) {
  const id = uuid();
  const email = `ext10-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status)
     VALUES ($1,'staff',$2,$3,'active')`,
    [id, email, `QA EXT10 ${role}`],
  );
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}

async function grant(identityId, permission) {
  await pool.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,'global',$4,'admin','QA EXT10 autorização granular') ON CONFLICT DO NOTHING`,
    [uuid(), identityId, permission, admin?.id || identityId],
  );
}

async function login(staff) {
  const response = await fetchTimeout(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: staff.email, password: staff.password }),
  });
  assert.equal(response.status, 200, `login falhou para ${staff.role}`);
  const cookies = response.headers.getSetCookie();
  const value = cookies.find((item) => item.startsWith("seg_admin_session="));
  assert.ok(value, `cookie ausente para ${staff.role}`);
  return value.split(";")[0];
}

async function api(url, {
  method = "GET",
  cookie = cookieAdmin,
  body,
  idempotencyKey,
  origin = base,
  headers = {},
} = {}) {
  const requestHeaders = {
    accept: "application/json",
    origin,
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": idempotencyKey === null ? "" : idempotencyKey || key("request") } : {}),
    ...headers,
  };
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  const response = await fetchTimeout(base + url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: parsed };
}

async function waitForServer() {
  for (let i = 0; i < 240; i += 1) {
    try {
      const ready = await fetchTimeout(`${base}/api/admin/session`);
      if ([200, 401].includes(ready.status)) return;
    } catch {}
    if (i === 239) throw new Error(`server_did_not_start\n${logs.slice(-4000)}`);
    await wait(400);
  }
}

function spawnServer() {
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(new URL(base).port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext10",
      SITE_ADMIN_SESSION_SECRET: sessionSecret,
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  return waitForServer();
}

async function stopServer() {
  if (!server || server.killed) return;
  const current = server;
  current.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => current.once("exit", resolve)),
    wait(3000),
  ]);
  if (!current.killed) current.kill("SIGKILL");
  server = null;
}

async function launchBrowser() {
  // @sparticuz/chromium caches /tmp/chromium. If a previous run happened
  // without AWS_EXECUTION_ENV, its AL2023 compatibility libraries were not
  // extracted; remove only that disposable cache before the isolated gate.
  const alLib = path.join(tmpdir(), "al2023", "lib");
  process.env.LD_LIBRARY_PATH = [alLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  if (!existsSync(path.join(alLib, "libnspr4.so"))) {
    await rm(path.join(tmpdir(), "chromium"), { force: true });
    await rm(path.join(tmpdir(), "al2023"), { recursive: true, force: true });
  }
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter((arg) => arg !== "--disable-web-security"),
    headless: true,
  });
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 16 });
  const port = 4400 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  await spawnServer();

  admin = await createStaff("admin", "admin");
  ti = await createStaff("ti", "ti");
  rh = await createStaff("rh", "rh");
  for (const permission of ["continuity.read", "continuity.write", "continuity.activate"]) await grant(admin.id, permission);
  for (const permission of ["continuity.read", "continuity.write"]) await grant(ti.id, permission);
  cookieAdmin = await login(admin);
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  await stopServer();
  await pool?.end().catch(() => {});
  if (logs.trim()) console.error(`SERVER_LOGS_TAIL_BEGIN\n${logs.slice(-6000)}\nSERVER_LOGS_TAIL_END`);
});

const opt = { skip: !RUN };

test("EXT-10 gate exige banco PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

test("EXT-10 cluster limpo não contém planos ou exercícios e a listagem HTTP está vazia", opt, async () => {
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ext_continuity_plans WHERE origin='ext10_canonica') AS plans,
      (SELECT count(*)::int FROM ext_continuity_exercises) AS exercises,
      (SELECT count(*)::int FROM ext_continuity_events) AS events`)).rows[0];
  assert.deepEqual(counts, { plans: 0, exercises: 0, events: 0 });
  const listed = await api("/api/ext/continuity/plans");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items, []);
  assert.match(listed.body.note, /nenhum acionamento externo/);
});

test("EXT-10 RBAC é fail-closed para anônimo, cookie inválido e papel sem grant", opt, async () => {
  assert.equal((await api("/api/ext/continuity/plans", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/continuity/plans", { cookie: "seg_admin_session=invalid" })).status, 401);
  assert.equal((await api("/api/ext/continuity/plans", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/continuity/plans", { method: "POST", cookie: cookieRh, body: {} })).status, 403);
  assert.equal((await api("/api/ext/continuity/plans/00000000-0000-4000-8000-000000000000/transition", { method: "POST", cookie: cookieTi, body: { status: "aprovado" } })).status, 403);
});

test("EXT-10 mutações exigem same-origin e chave de idempotência", opt, async () => {
  const payload = { title: "Plano same-origin sintético", description: "Descrição interna para a prova de origem.", responsible_name: "Equipe QA" };
  assert.equal((await api("/api/ext/continuity/plans", { method: "POST", body: payload, origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/continuity/plans", { method: "POST", body: payload, idempotencyKey: null })).status, 400);
});

test("EXT-10 cria plano por HTTP com posto, contatos e procedimentos internos", opt, async () => {
  const response = await api("/api/ext/continuity/plans", {
    method: "POST",
    body: {
      title: "Plano posto sintético A",
      description: "Plano fictício para continuidade operacional interna.",
      post_id: "posto-sintetico-a",
      contacts: [{ name: "Equipe interna A", channel: "registro interno" }],
      contingency_steps: ["Registrar indisponibilidade no sistema", "Acionar responsável interno"],
      recovery_steps: ["Restaurar procedimento documentado", "Registrar resultado do exercício"],
      responsible_name: "Responsável sintético A",
      next_test_due: "2026-12-01",
    },
  });
  assert.equal(response.status, 201);
  planA = response.body.plan;
  assert.equal(planA.status, "rascunho");
  assert.equal(planA.origin, "ext10_canonica");
  assert.equal(planA.created_by_identity, admin.id);
  assert.equal(planA.post_id, "posto-sintetico-a");
  assert.match(planA.protocol, /^CONT-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(response.body.plan.contacts[0].channel, "registro interno");
});

test("EXT-10 sessões distintas preservam autoria e leitura autorizada sem confiar no corpo", opt, async () => {
  const response = await api("/api/ext/continuity/plans", {
    method: "POST",
    cookie: cookieTi,
    body: {
      title: "Plano posto sintético B",
      description: "Segundo plano fictício para provar sessão individual.",
      post_id: "posto-sintetico-b",
      responsible_name: "Responsável sintético B",
    },
  });
  assert.equal(response.status, 201);
  planB = response.body.plan;
  assert.equal(planB.created_by_identity, ti.id);
  assert.notEqual(planA.created_by_identity, planB.created_by_identity);
  const detailAsTi = await api(`/api/ext/continuity/plans/${planA.id}`, { cookie: cookieTi });
  assert.equal(detailAsTi.status, 200);
  assert.equal(detailAsTi.body.plan.id, planA.id);
  assert.equal(detailAsTi.body.plan.created_by_identity, admin.id);
  const audit = (await pool.query(`SELECT count(*)::int AS n FROM auth_access_audit WHERE actor_id=$1 AND action='continuity_plan_create'`, [ti.id])).rows[0].n;
  assert.equal(audit, 1);
});

test("EXT-10 máquina rejeita salto ilegal e exige permissão de ativação", opt, async () => {
  const invalid = await api(`/api/ext/continuity/plans/${planA.id}/transition`, { method: "POST", body: { status: "testado" } });
  assert.equal(invalid.status, 409);
  assert.equal(invalid.body.error, "invalid_transition");
  const noActivate = await api(`/api/ext/continuity/plans/${planA.id}/transition`, { method: "POST", cookie: cookieTi, body: { status: "aprovado" } });
  assert.equal(noActivate.status, 403);
});

let approvalKey;
test("EXT-10 transição aprovada tem replay idêntico e conflito divergente", opt, async () => {
  approvalKey = key("approval");
  const first = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST",
    idempotencyKey: approvalKey,
    body: { status: "aprovado" },
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.plan.status, "aprovado");
  const replay = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST",
    idempotencyKey: approvalKey,
    body: { status: "aprovado" },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.plan.id, planA.id);
  const conflict = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST",
    idempotencyKey: approvalKey,
    body: { status: "arquivado", justification: "Conflito de payload" },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, "idempotency_conflict_payload_mismatch");
});

test("EXT-10 exercício nasce por HTTP, atualiza teste e replay não duplica", opt, async () => {
  const toTest = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST",
    body: { status: "em_teste" },
  });
  assert.equal(toTest.status, 200);
  assert.equal(toTest.body.plan.status, "em_teste");

  const exerciseKey = key("exercise");
  const payload = {
    exercise_date: "2026-10-04",
    result: "Simulado interno concluído com registro das ações corretivas.",
    responsible_name: "Equipe TI sintética",
    next_due: "2027-01-04",
    is_success: true,
  };
  const first = await api(`/api/ext/continuity/plans/${planA.id}/exercises`, {
    method: "POST", cookie: cookieTi, idempotencyKey: exerciseKey, body: payload,
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.exercise.responsible_identity, ti.id);
  assert.match(first.body.note, /não há disparo externo/);
  const replay = await api(`/api/ext/continuity/plans/${planA.id}/exercises`, {
    method: "POST", cookie: cookieTi, idempotencyKey: exerciseKey, body: payload,
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.exercise.id, first.body.exercise.id);
  const conflict = await api(`/api/ext/continuity/plans/${planA.id}/exercises`, {
    method: "POST", cookie: cookieTi, idempotencyKey: exerciseKey,
    body: { ...payload, result: "Outro resultado divergente do mesmo pedido." },
  });
  assert.equal(conflict.status, 409);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_exercises WHERE plan_id=$1`, [planA.id])).rows[0].n, 1);
  const detail = await api(`/api/ext/continuity/plans/${planA.id}`, { cookie: cookieTi });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.plan.status, "testado");
  assert.equal(detail.body.exercises.length, 1);
  assert.equal(detail.body.events.length, 4);
});

test("EXT-10 justificativas e estados desatualizado/arquivado são controlados", opt, async () => {
  const missing = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST", body: { status: "desatualizado" },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "justification_required");
  const stale = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST", body: { status: "desatualizado", justification: "Revisão periódica sintética." },
  });
  assert.equal(stale.status, 200);
  assert.equal(stale.body.plan.status, "desatualizado");
  const archived = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST", body: { status: "arquivado", justification: "Plano substituído por registro sintético." },
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.plan.status, "arquivado");
  const reopen = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: "POST", body: { status: "rascunho" },
  });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.plan.status, "rascunho");
});

test("EXT-10 concorrência com mesma chave cria um único plano", opt, async () => {
  const sameKey = key("concurrent-create");
  const payload = {
    title: "Plano concorrente sintético",
    description: "Plano criado duas vezes em concorrência controlada.",
    responsible_name: "Equipe concorrente",
  };
  const results = await Promise.all([
    api("/api/ext/continuity/plans", { method: "POST", idempotencyKey: sameKey, body: payload }),
    api("/api/ext/continuity/plans", { method: "POST", idempotencyKey: sameKey, body: payload }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort((a, b) => a - b), [200, 201]);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_plans WHERE idempotency_key=$1`, [sameKey])).rows[0].n, 1);
});

test("EXT-10 FOR UPDATE serializa duas transições concorrentes do mesmo plano", opt, async () => {
  const results = await Promise.all([
    api(`/api/ext/continuity/plans/${planB.id}/transition`, { method: "POST", idempotencyKey: key("transition-a"), body: { status: "aprovado" } }),
    api(`/api/ext/continuity/plans/${planB.id}/transition`, { method: "POST", idempotencyKey: key("transition-b"), body: { status: "aprovado" } }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort((a, b) => a - b), [200, 409]);
  assert.equal((await pool.query(`SELECT status FROM ext_continuity_plans WHERE id=$1`, [planB.id])).rows[0].status, "aprovado");
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_events WHERE plan_id=$1 AND event_type='status_aprovado'`, [planB.id])).rows[0].n, 1);
});

test("EXT-10 eventos de continuidade são append-only e imutáveis no PostgreSQL", opt, async () => {
  await assert.rejects(() => pool.query(`UPDATE ext_continuity_events SET summary='alterado' WHERE plan_id=$1`, [planA.id]));
  await assert.rejects(() => pool.query(`DELETE FROM ext_continuity_events WHERE plan_id=$1`, [planA.id]));
});

test("EXT-10 falha de auditoria devolve 503 e faz rollback completo", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext10_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ext10_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext10_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ext10_fail_audit()`);
  const title = "Plano rollback auditável sintético";
  try {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_plans WHERE origin='ext10_canonica'`)).rows[0].n;
    const failed = await api("/api/ext/continuity/plans", {
      method: "POST",
      body: { title, description: "Este plano deve sofrer rollback integral.", responsible_name: "Equipe rollback" },
    });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "audit_unavailable");
    const after = (await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_plans WHERE origin='ext10_canonica'`)).rows[0].n;
    assert.equal(after, before);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_events WHERE summary='Plano de continuidade criado' AND payload->>'title'=$1`, [title])).rows[0].n, 0);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext10_fail_audit ON auth_access_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext10_fail_audit()`);
  }
});

test("EXT-10 escrita legada recebe 410 depois das guardas", opt, async () => {
  assert.equal((await api("/api/ext/continuity-plans", { method: "POST", cookie: null, body: {} })).status, 401);
  assert.equal((await api("/api/ext/continuity-plans", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403);
  const retired = await api("/api/ext/continuity-plans", {
    method: "POST",
    body: { title: "Tentativa legada sintética", description: "Não deve criar plano.", responsible_name: "Ninguém" },
  });
  assert.equal(retired.status, 410);
  assert.equal(retired.body.canonical, "/api/ext/continuity/plans");
});

test("EXT-10 UI real protegida registra plano sem acionar serviço externo", opt, async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
    const pair = cookieAdmin.split(";")[0];
    const separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}/admin/continuidade`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("heading", { name: "Continuidade de negócios e contingência" }).waitFor();
    await page.getByPlaceholder("Título").fill("Plano navegador sintético");
    await page.getByPlaceholder("Descrição e escopo").fill("Plano registrado pela interface administrativa real.");
    await page.getByPlaceholder("Responsável").fill("Responsável navegador");
    await page.getByPlaceholder("Passos de contingência, um por linha").fill("Registrar exercício interno");
    await page.getByPlaceholder("Passos de recuperação, um por linha").fill("Registrar recuperação interna");
    await page.getByRole("button", { name: "Registrar plano" }).click();
    await page.getByText("Plano navegador sintético", { exact: true }).waitFor();
    assert.match(await page.locator("main").last().innerText(), /não envia alertas externos/);
    browserPlan = (await pool.query(`SELECT id FROM ext_continuity_plans WHERE title='Plano navegador sintético'`)).rows[0];
    assert.ok(browserPlan?.id);
    await context.close();
  } finally {
    await browser.close();
  }
});

test("EXT-10 estado e sessão persistem depois de reiniciar o servidor HTTP", opt, async () => {
  await stopServer();
  await spawnServer();
  const detail = await api(`/api/ext/continuity/plans/${browserPlan.id}`, { cookie: cookieAdmin });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.plan.title, "Plano navegador sintético");
  assert.equal(detail.body.plan.status, "rascunho");
  assert.ok(detail.body.events.length >= 1);
});
