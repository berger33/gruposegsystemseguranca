// EXT-11 / F07 — PostgreSQL 17 descartável + servidor HTTP real.
// A autenticação é preparada no banco apenas para criar sessões staff reais;
// todos os experimentos e observações nascem por HTTP canônico.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT11_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const uuid = () => randomUUID();
const key = (name) => `ext11-${name}-${uuid()}`;

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
let experimentId;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(init.method && init.method !== "GET" ? 60000 : 30000) });

async function createStaff(role, tag) {
  const id = uuid();
  const email = `ext11-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`, [id, email, `QA EXT11 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}

async function grant(identityId, permission) {
  await pool.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,'global',$4,'admin','QA EXT11 autorização granular') ON CONFLICT DO NOTHING`,
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
  assert.ok(value);
  return value.split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieAdmin, body, idempotencyKey, origin = base, headers = {} } = {}) {
  const requestHeaders = {
    accept: "application/json",
    origin,
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": idempotencyKey === null ? "" : idempotencyKey || key("request") } : {}),
    ...headers,
  };
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  const response = await fetchTimeout(base + url, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: response.status, body: parsed };
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 4100 + Math.floor(Math.random() * 500);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext11",
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
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
  for (let i = 0; i < 240; i += 1) {
    try {
      const ready = await fetchTimeout(`${base}/api/admin/session`);
      if ([200, 401].includes(ready.status)) break;
    } catch {}
    if (i === 239) throw new Error(`server_did_not_start\n${logs.slice(-3000)}`);
    await wait(400);
  }
  admin = await createStaff("admin", "admin");
  ti = await createStaff("ti", "ti");
  rh = await createStaff("rh", "rh");
  await grant(admin.id, "analytics.read");
  await grant(admin.id, "analytics.write");
  await grant(admin.id, "analytics.approve");
  await grant(admin.id, "analytics.execute");
  await grant(ti.id, "analytics.read");
  await grant(ti.id, "analytics.write");
  await grant(ti.id, "analytics.approve");
  await grant(ti.id, "analytics.execute");
  cookieAdmin = await login(admin);
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await wait(300);
    server.kill("SIGKILL");
  }
  if (logs.trim()) console.error(`SERVER_LOGS_TAIL_BEGIN\n${logs.slice(-5000)}\nSERVER_LOGS_TAIL_END`);
});

const opt = { skip: !RUN };

test("EXT-11 gate exige banco PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

test("EXT-11 cluster limpo não contém negócio criado por SQL e lista canônica vazia", opt, async () => {
  const counts = (await pool.query(`SELECT (SELECT count(*) FROM ext_analytics_experiments WHERE origin='ext11_canonica') AS experiments, (SELECT count(*) FROM ext_analytics_observations) AS observations, (SELECT count(*) FROM ext_analytics_experiment_events) AS events`)).rows[0];
  assert.deepEqual(counts, { experiments: "0", observations: "0", events: "0" });
  const listed = await api("/api/ext/analytics/experiments");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items, []);
});

test("EXT-11 anônimo, sessão inválida e papel sem grant são rejeitados", opt, async () => {
  assert.equal((await api("/api/ext/analytics/experiments", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/analytics/experiments", { cookie: "seg_admin_session=invalid" })).status, 401);
  assert.equal((await api("/api/ext/analytics/experiments", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/analytics/experiments", { method: "POST", cookie: cookieRh, body: {} })).status, 403);
});

test("EXT-11 mutações exigem same-origin e Idempotency-Key", opt, async () => {
  const payload = { hypothesis: "Hipótese explícita sobre uma alteração observável", description: "Escopo interno sem tráfego externo.", variant_a: "Tela A", variant_b: "Tela B", metric_name: "taxa agregada" };
  assert.equal((await api("/api/ext/analytics/experiments", { method: "POST", body: payload, origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/analytics/experiments", { method: "POST", body: payload, idempotencyKey: null })).status, 400);
});

test("EXT-11 cria rascunho por HTTP com hipótese, variantes, métrica e minimização", opt, async () => {
  const response = await api("/api/ext/analytics/experiments", {
    method: "POST",
    body: {
      hypothesis: "Hipótese explícita sobre uma alteração observável",
      description: "Escopo interno sem tráfego externo ou fornecedor.",
      variant_a: "Tela A",
      variant_b: "Tela B",
      metric_name: "taxa agregada",
      privacy_note: "Sem identificadores diretos e com minimização de dados.",
    },
  });
  assert.equal(response.status, 201);
  experimentId = response.body.experiment.id;
  assert.equal(response.body.experiment.status, "rascunho");
  assert.equal(response.body.experiment.origin, "ext11_canonica");
  assert.match(response.body.experiment.protocol, /^AB-EXT-\d{8}-[A-Z0-9]{4}$/);
});

let createKey;
let createPayload;
test("EXT-11 replay idêntico não duplica e payload divergente conflita", opt, async () => {
  createKey = key("replay");
  createPayload = { hypothesis: "Hipótese de replay idêntico e determinístico", description: "Rascunho dedicado à prova de idempotência.", variant_a: "Opção A", variant_b: "Opção B", metric_name: "eventos válidos" };
  const first = await api("/api/ext/analytics/experiments", { method: "POST", body: createPayload, idempotencyKey: createKey });
  assert.equal(first.status, 201);
  const replay = await api("/api/ext/analytics/experiments", { method: "POST", body: createPayload, idempotencyKey: createKey });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.experiment.id, first.body.experiment.id);
  const conflict = await api("/api/ext/analytics/experiments", { method: "POST", body: { ...createPayload, metric_name: "outra métrica" }, idempotencyKey: createKey });
  assert.equal(conflict.status, 409);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_analytics_experiments WHERE idempotency_key=$1`, [createKey])).rows[0].n, 1);
});

test("EXT-11 execução sem aprovação humana é recusada", opt, async () => {
  const response = await api(`/api/ext/analytics/experiments/${experimentId}/transition`, { method: "POST", body: { status: "em_execucao" } });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "approval_required");
});

test("EXT-11 aprovação humana exige nota e é registrada por HTTP", opt, async () => {
  const missing = await api(`/api/ext/analytics/experiments/${experimentId}/approve`, { method: "POST", body: {} });
  assert.equal(missing.status, 400);
  const approved = await api(`/api/ext/analytics/experiments/${experimentId}/approve`, { method: "POST", cookie: cookieTi, body: { approval_note: "Revisado por pessoa responsável: hipótese, variantes, métrica e privacidade." } });
  assert.equal(approved.status, 200);
  assert.ok(approved.body.experiment.approved_at);
  assert.equal(approved.body.experiment.status, "rascunho");
});

test("EXT-11 transição inválida e observação fora da execução são rejeitadas", opt, async () => {
  const invalid = await api(`/api/ext/analytics/experiments/${experimentId}/transition`, { method: "POST", body: { status: "concluido", conclusion_note: "Tentativa sem observações reais." } });
  assert.equal(invalid.status, 409);
  assert.equal(invalid.body.error, "invalid_transition");
  const observation = await api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", body: { variant: "A", metric_name: "taxa agregada", metric_value: 1, sample_size: 1, source_type: "internal_event", source_reference: "ops-event-before-run", source_recorded_at: new Date().toISOString() } });
  assert.equal(observation.status, 409);
  assert.equal(observation.body.error, "experiment_not_running");
});

test("EXT-11 inicia execução somente depois da aprovação", opt, async () => {
  const response = await api(`/api/ext/analytics/experiments/${experimentId}/transition`, { method: "PATCH", cookie: cookieTi, body: { status: "em_execucao" } });
  assert.equal(response.status, 200);
  assert.equal(response.body.experiment.status, "em_execucao");
});

test("EXT-11 observações inventadas, sem origem ou futuras são rejeitadas", opt, async () => {
  const baseBody = { variant: "A", metric_name: "taxa agregada", metric_value: 4, sample_size: 10, source_type: "internal_operational_record", source_recorded_at: new Date().toISOString() };
  const noSource = await api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", body: { ...baseBody, source_reference: "synthetic-fixture" } });
  assert.equal(noSource.status, 400);
  assert.equal(noSource.body.error, "real_source_required");
  const fake = await api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", body: { ...baseBody, source_reference: "manual-result", result: "vencedor A" } });
  assert.equal(fake.status, 400);
  const future = await api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", body: { ...baseBody, source_reference: "operational-future", source_recorded_at: "2999-01-01T00:00:00.000Z" } });
  assert.equal(future.status, 400);
});

let observationA;
let observationB;
test("EXT-11 registra observações reais A/B e não aceita vencedor como verdade", opt, async () => {
  observationA = await api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", body: { variant: "A", metric_name: "taxa agregada", metric_value: 4, sample_size: 10, source_type: "internal_operational_record", source_reference: "ops-ledger-20261004-a", source_recorded_at: new Date().toISOString() } });
  assert.equal(observationA.status, 201);
  observationB = await api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", body: { variant: "B", metric_name: "taxa agregada", metric_value: 5, sample_size: 11, source_type: "internal_operational_record", source_reference: "ops-ledger-20261004-b", source_recorded_at: new Date().toISOString() } });
  assert.equal(observationB.status, 201);
  assert.equal("winner" in observationA.body.observation, false);
});

test("EXT-11 concorrência com mesma chave produz uma observação, não dois efeitos", opt, async () => {
  const same = key("concurrent");
  const payload = { variant: "A", metric_name: "taxa agregada", metric_value: 7, sample_size: 3, source_type: "internal_event", source_reference: "ops-event-concurrent", source_recorded_at: new Date().toISOString() };
  const results = await Promise.all([
    api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", idempotencyKey: same, body: payload }),
    api(`/api/ext/analytics/experiments/${experimentId}/observations`, { method: "POST", idempotencyKey: same, body: payload }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort((a, b) => a - b), [200, 201]);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_analytics_observations WHERE idempotency_key=$1`, [same])).rows[0].n, 1);
});

test("EXT-11 detalhe expõe trilha, origem e ausência de vencedor/significância", opt, async () => {
  const detail = await api(`/api/ext/analytics/experiments/${experimentId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.observations.length >= 2, true);
  assert.equal(detail.body.events.length >= 4, true);
  assert.equal(detail.body.result.sufficient_for_descriptive_view, true);
  assert.match(detail.body.result.conclusion, /nenhuma significância/);
  assert.equal("winner" in detail.body.result, false);
});

test("EXT-11 conclusão exige nota e dados reais; cancelamento é controlado", opt, async () => {
  const second = await api("/api/ext/analytics/experiments", { method: "POST", body: { hypothesis: "Hipótese separada para cancelamento reversível", description: "Experimento sem execução externa.", variant_a: "Canal A", variant_b: "Canal B", metric_name: "registro" } });
  assert.equal(second.status, 201);
  const secondId = second.body.experiment.id;
  const cancelled = await api(`/api/ext/analytics/experiments/${secondId}/transition`, { method: "POST", body: { status: "cancelado", justification: "Cancelado antes da aprovação operacional." } });
  assert.equal(cancelled.status, 200);
  const invalidReopen = await api(`/api/ext/analytics/experiments/${secondId}/transition`, { method: "POST", body: { status: "em_execucao" } });
  assert.equal(invalidReopen.status, 409);
  const concluded = await api(`/api/ext/analytics/experiments/${experimentId}/transition`, { method: "POST", body: { status: "concluido", conclusion_note: "Conclusão humana baseada somente nas observações internas registradas; sem significância." } });
  assert.equal(concluded.status, 200);
  assert.equal(concluded.body.experiment.status, "concluido");
});

test("EXT-11 eventos e observações são imutáveis no PostgreSQL", opt, async () => {
  await assert.rejects(() => pool.query(`UPDATE ext_analytics_experiment_events SET summary='alterado' WHERE experiment_id=$1`, [experimentId]));
  await assert.rejects(() => pool.query(`DELETE FROM ext_analytics_observations WHERE experiment_id=$1`, [experimentId]));
});

test("EXT-11 falha de auditoria causa 503 e rollback completo", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext11_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ext11_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext11_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ext11_fail_audit()`);
  try {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM ext_analytics_experiments WHERE origin='ext11_canonica'`)).rows[0].n;
    const failed = await api("/api/ext/analytics/experiments", { method: "POST", body: { hypothesis: "Hipótese que deve sofrer rollback transacional", description: "A auditoria será indisponibilizada no gate.", variant_a: "Rollback A", variant_b: "Rollback B", metric_name: "sem efeito" } });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "audit_unavailable");
    const after = (await pool.query(`SELECT count(*)::int AS n FROM ext_analytics_experiments WHERE origin='ext11_canonica'`)).rows[0].n;
    assert.equal(after, before);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext11_fail_audit ON auth_access_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext11_fail_audit()`);
  }
});

test("EXT-11 escrita legada recebe 410 depois de autenticação e same-origin", opt, async () => {
  const before = (await pool.query(`SELECT count(*)::int AS n FROM ext_analytics_experiments WHERE origin='ext11_canonica'`)).rows[0].n;
  assert.equal((await api("/api/ext/analytics-experiments", { method: "POST", cookie: null, body: {} })).status, 401);
  assert.equal((await api("/api/ext/analytics-experiments", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403);
  const retired = await api("/api/ext/analytics-experiments", { method: "POST", body: { hypothesis: "Tentativa de escrita pela rota legada", description: "Não deve criar estado.", variant_a: "Legada A", variant_b: "Legada B", metric_name: "nunca" } });
  assert.equal(retired.status, 410);
  const after = (await pool.query(`SELECT count(*)::int AS n FROM ext_analytics_experiments WHERE origin='ext11_canonica'`)).rows[0].n;
  assert.equal(after, before);
});


// UX-07 analytics: navegador real no mesmo processo, para preservar a sessão
// staff autenticada. A falha de leitura é injetada somente por addInitScript.
test("UX-07 analytics browser: h1 real, falha honesta, abas acessíveis e sem scroll horizontal", opt, async () => {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let browser;
    try {
      browser = await chromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: [...packagedChromium.args.filter((arg) => arg !== "--disable-web-security"), "--single-process"] });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies([{ name: "seg_admin_session", value: cookieAdmin.split("=")[1], url: base }]);
      const page = await context.newPage();
      await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (...args) => String(args[0]).includes("/api/ext/analytics/experiments")
          ? Promise.resolve(new Response(JSON.stringify({ error: "database_error" }), { status: 503, headers: { "content-type": "application/json" } }))
          : original(...args);
      });
      await page.goto(`${base}/admin/analytics`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Analytics e experimentos A/B controlados" }).waitFor();
      const failure = await page.locator('[data-ui-state="error"]').first().innerText();
      assert.match(failure, /Dados indisponíveis/);
      assert.match(failure, /não significa que a lista esteja vazia/);
      assert.equal(await page.getByRole("tab").count(), 3);
      await page.getByRole("tab", { name: "Novo rascunho" }).focus();
      await page.keyboard.press("End");
      assert.equal(await page.getByRole("tab", { name: "Trilha do experimento" }).getAttribute("aria-selected"), "true");
      await page.keyboard.press("Home");
      assert.equal(await page.getByRole("tab", { name: "Novo rascunho" }).getAttribute("aria-selected"), "true");
      assert.equal(await page.locator('[role="tabpanel"]').count(), 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `scroll horizontal inesperado: ${overflow}px`);
      await browser.close();
      return;
    } catch (error) {
      last = error;
      await browser?.close().catch(() => {});
      if (!String(error?.message || error).includes("ERR_ASSERTION")) throw error;
    }
  }
  throw last;
});

// Autorização continua sendo decidida pelo servidor: o papel sem permissão
// granular não lê a jornada canônica, mesmo navegando até a rota.
test("UX-07 analytics browser: papel sem permissão granular não recebe dados", opt, async () => {
  assert.equal((await api("/api/ext/analytics/experiments", { cookie: cookieRh })).status, 403);
});
