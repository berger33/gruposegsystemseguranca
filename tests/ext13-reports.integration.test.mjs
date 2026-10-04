// EXT-13 / F09 — PostgreSQL 17 descartável + servidor HTTP real.
// SQL prepara somente identidades, credenciais, grants e controles de teste;
// definições, aprovações, gerações e envios registrados nascem por HTTP
// canônico. O dado-fonte comercial usado na consolidação nasce pela rota
// pública real /api/leads, nunca por INSERT SQL de negócio.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT13_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const uuid = () => randomUUID();
const key = (name) => `ext13-${name}-${uuid()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(init.method && init.method !== "GET" ? 60000 : 30000) });

const today = new Date().toISOString().slice(0, 10);
const periodStart = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

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
let report;

async function createStaff(role, tag) {
  const id = uuid();
  const email = `ext13-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`, [id, email, `QA EXT13 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}

async function grant(identityId, permission) {
  await pool.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,'global',$4,'admin','QA EXT13 autorização granular') ON CONFLICT DO NOTHING`,
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
  const value = response.headers.getSetCookie().find((item) => item.startsWith("seg_admin_session="));
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
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: parsed };
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 14 });
  const port = 4500 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext13",
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
    if (i === 239) throw new Error(`server_did_not_start\n${logs.slice(-4000)}`);
    await wait(400);
  }
  admin = await createStaff("admin", "admin");
  ti = await createStaff("ti", "ti");
  rh = await createStaff("rh", "rh");
  for (const permission of ["reports.read", "reports.write", "reports.review", "reports.send"]) {
    await grant(admin.id, permission);
    await grant(ti.id, permission);
  }
  cookieAdmin = await login(admin);
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await wait(500);
    server.kill("SIGKILL");
  }
  if (logs.trim()) console.error(`SERVER_LOGS_TAIL_BEGIN\n${logs.slice(-6000)}\nSERVER_LOGS_TAIL_END`);
});

const opt = { skip: !RUN };

test("EXT-13 gate exige banco PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

test("EXT-13 cluster limpo não contém relatórios canônicos", opt, async () => {
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ext_periodic_reports WHERE origin='ext13_canonica') AS reports,
      (SELECT count(*)::int FROM ext_report_events) AS events`)).rows[0];
  assert.deepEqual(counts, { reports: 0, events: 0 });
  const listed = await api("/api/ext/reports/periodic");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items, []);
});

test("EXT-13 RBAC fail-closed para anônimo, cookie inválido e papel sem grant", opt, async () => {
  assert.equal((await api("/api/ext/reports/periodic", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/reports/periodic", { cookie: "seg_admin_session=invalid" })).status, 401);
  assert.equal((await api("/api/ext/reports/periodic", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/reports/periodic", { method: "POST", cookie: cookieRh, body: {} })).status, 403);
});

test("EXT-13 mutações exigem same-origin e Idempotency-Key", opt, async () => {
  const payload = { title: "Relatório prova de origem", report_type: "comercial", period_start: periodStart, period_end: today, recipient_emails: ["qa@example.invalid"] };
  assert.equal((await api("/api/ext/reports/periodic", { method: "POST", body: payload, origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/reports/periodic", { method: "POST", body: payload, idempotencyKey: null })).status, 400);
});

test("EXT-13 validações recusam tipo sem fonte e período invertido", opt, async () => {
  const common = { title: "Relatório inválido", period_start: periodStart, period_end: today, recipient_emails: ["qa@example.invalid"] };
  const badType = await api("/api/ext/reports/periodic", { method: "POST", body: { ...common, report_type: "outro" } });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error, "invalid_report_type");
  const badPeriod = await api("/api/ext/reports/periodic", { method: "POST", body: { ...common, report_type: "comercial", period_start: today, period_end: periodStart } });
  assert.equal(badPeriod.status, 400);
  assert.equal(badPeriod.body.error, "invalid_period");
});

test("EXT-13 cria definição por HTTP com protocolo, autoria e destinatários", opt, async () => {
  const response = await api("/api/ext/reports/periodic", {
    method: "POST",
    body: {
      title: "Relatório comercial do período",
      report_type: "comercial",
      period_start: periodStart,
      period_end: today,
      recipient_emails: [admin.email, ti.email],
      change_summary: "Definição criada por HTTP canônico no gate",
    },
  });
  assert.equal(response.status, 201);
  report = response.body.report;
  assert.equal(report.status, "rascunho");
  assert.equal(report.origin, "ext13_canonica");
  assert.equal(report.created_by_identity, admin.id);
  assert.match(report.protocol, /^RELP-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.deepEqual(report.recipient_emails, [admin.email, ti.email]);
});

test("EXT-13 replay idêntico não duplica e payload divergente conflita", opt, async () => {
  const replayKey = key("replay");
  const payload = { title: "Relatório para prova de replay", report_type: "financeiro", period_start: periodStart, period_end: today, recipient_emails: [admin.email] };
  const first = await api("/api/ext/reports/periodic", { method: "POST", idempotencyKey: replayKey, body: payload });
  assert.equal(first.status, 201);
  const replay = await api("/api/ext/reports/periodic", { method: "POST", idempotencyKey: replayKey, body: payload });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.report.id, first.body.report.id);
  const conflict = await api("/api/ext/reports/periodic", { method: "POST", idempotencyKey: replayKey, body: { ...payload, title: "Relatório divergente no replay" } });
  assert.equal(conflict.status, 409);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_periodic_reports WHERE idempotency_key=$1`, [replayKey])).rows[0].n, 1);
});

test("EXT-13 geração exige aprovação humana anterior", opt, async () => {
  const early = await api(`/api/ext/reports/periodic/${report.id}/generate`, { method: "POST", body: { generation_note: "Tentativa antes da aprovação." } });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, "approval_required");
});

test("EXT-13 máquina de estados exige justificativa na aprovação", opt, async () => {
  assert.equal((await api(`/api/ext/reports/periodic/${report.id}/transition`, { method: "POST", body: { status: "em_revisao" } })).status, 200);
  const noNote = await api(`/api/ext/reports/periodic/${report.id}/transition`, { method: "POST", body: { status: "aprovado" } });
  assert.equal(noNote.status, 400);
  assert.equal(noNote.body.error, "justification_required");
  const approved = await api(`/api/ext/reports/periodic/${report.id}/transition`, { method: "POST", cookie: cookieTi, body: { status: "aprovado", approval_note: "Aprovação humana sintética do relatório periódico." } });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.report.status, "aprovado");
  assert.equal(approved.body.report.approved_by_identity, ti.id);
  const invalid = await api(`/api/ext/reports/periodic/${report.id}/transition`, { method: "POST", body: { status: "envio_registrado" } });
  assert.equal(invalid.status, 400);
});

test("EXT-13 lead público por HTTP vira dado-fonte real da consolidação", opt, async () => {
  const lead = await fetchTimeout(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      requestKind: "quote",
      name: "QA EXT13 Lead",
      phone: "(11) 98888-7777",
      city: "Guarulhos",
      propertyType: "Condomínio",
      services: ["Segurança Desarmada"],
      details: "Pedido sintético do gate EXT-13.",
      consent: true,
    }),
  });
  assert.ok([200, 201].includes(lead.status), `lead público falhou: ${lead.status}`);
});

test("EXT-13 geração conta fontes internas e os totais conferem com o SQL", opt, async () => {
  const generated = await api(`/api/ext/reports/periodic/${report.id}/generate`, { method: "POST", cookie: cookieTi, body: { generation_note: "Consolidação contada no gate EXT-13." } });
  assert.equal(generated.status, 200);
  const row = generated.body.report;
  assert.equal(row.status, "gerado");
  assert.equal(row.generated_by_identity, ti.id);
  assert.equal(String(row.generation_fingerprint).length, 64);
  const totals = generated.body.totals;
  assert.deepEqual(Object.keys(totals.sources).sort(), ["crm_contacts", "public_leads"]);
  for (const table of ["public_leads", "crm_contacts"]) {
    const counted = (await pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
      [periodStart, today],
    )).rows[0].n;
    assert.equal(totals.sources[table], counted, `total divergente para ${table}`);
  }
  assert.ok(totals.sources.public_leads >= 1, "o lead público criado por HTTP deve entrar na contagem");
  assert.equal(totals.total_records, totals.sources.public_leads + totals.sources.crm_contacts);
});

test("EXT-13 envio exige geração e recusa destinatário fora do staff ativo", opt, async () => {
  const other = await api("/api/ext/reports/periodic", {
    method: "POST",
    body: { title: "Relatório sem geração", report_type: "operacional", period_start: periodStart, period_end: today, recipient_emails: [admin.email] },
  });
  assert.equal(other.status, 201);
  const notGenerated = await api(`/api/ext/reports/periodic/${other.body.report.id}/send`, { method: "POST", body: { send_note: "Tentativa sem geração anterior." } });
  assert.equal(notGenerated.status, 409);
  assert.equal(notGenerated.body.error, "generation_required");

  const stranger = await api("/api/ext/reports/periodic", {
    method: "POST",
    body: { title: "Relatório com destinatário externo", report_type: "comercial", period_start: periodStart, period_end: today, recipient_emails: ["fora-do-quadro@example.invalid"] },
  });
  assert.equal(stranger.status, 201);
  const sid = stranger.body.report.id;
  assert.equal((await api(`/api/ext/reports/periodic/${sid}/transition`, { method: "POST", body: { status: "em_revisao" } })).status, 200);
  assert.equal((await api(`/api/ext/reports/periodic/${sid}/transition`, { method: "POST", body: { status: "aprovado", approval_note: "Aprovação sintética para prova de destinatário." } })).status, 200);
  assert.equal((await api(`/api/ext/reports/periodic/${sid}/generate`, { method: "POST", body: { generation_note: "Geração para prova de destinatário." } })).status, 200);
  const refused = await api(`/api/ext/reports/periodic/${sid}/send`, { method: "POST", body: { send_note: "Envio com destinatário fora do quadro." } });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "recipient_not_active_staff");
});

test("EXT-13 envio registrado é interno, autorizado e sem SMTP", opt, async () => {
  const sent = await api(`/api/ext/reports/periodic/${report.id}/send`, { method: "POST", body: { send_note: "Envio registrado internamente no gate EXT-13." } });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.report.status, "envio_registrado");
  assert.equal(sent.body.report.sent_by_identity, admin.id);
  assert.ok(sent.body.report.sent_at);
  assert.match(sent.body.note, /nenhum e-mail foi enviado/);
  const detail = await api(`/api/ext/reports/periodic/${report.id}`);
  assert.equal(detail.status, 200);
  const dispatch = detail.body.events.find((event) => event.event_type === "report_dispatch_registered");
  assert.ok(dispatch);
  assert.match(dispatch.payload.boundary, /SMTP pendente/);
});

test("EXT-13 concorrência com mesma chave cria um único relatório", opt, async () => {
  const same = key("concurrent");
  const payload = { title: "Relatório concorrente controlado", report_type: "qualidade", period_start: periodStart, period_end: today, recipient_emails: [admin.email] };
  const results = await Promise.all([
    api("/api/ext/reports/periodic", { method: "POST", idempotencyKey: same, body: payload }),
    api("/api/ext/reports/periodic", { method: "POST", idempotencyKey: same, body: payload }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort((a, b) => a - b), [200, 201]);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_periodic_reports WHERE idempotency_key=$1`, [same])).rows[0].n, 1);
});

test("EXT-13 eventos e logs são append-only no PostgreSQL", opt, async () => {
  await assert.rejects(() => pool.query(`UPDATE ext_report_events SET summary='alterado' WHERE report_id=$1`, [report.id]));
  await assert.rejects(() => pool.query(`DELETE FROM ext_report_events WHERE report_id=$1`, [report.id]));
});

test("EXT-13 falha de auditoria retorna 503 e rollback completo", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext13_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ext13_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext13_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ext13_fail_audit()`);
  try {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM ext_periodic_reports WHERE origin='ext13_canonica'`)).rows[0].n;
    const failed = await api("/api/ext/reports/periodic", {
      method: "POST",
      body: { title: "Relatório que deve sofrer rollback", report_type: "satisfacao", period_start: periodStart, period_end: today, recipient_emails: [admin.email] },
    });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "audit_unavailable");
    const after = (await pool.query(`SELECT count(*)::int AS n FROM ext_periodic_reports WHERE origin='ext13_canonica'`)).rows[0].n;
    assert.equal(after, before);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext13_fail_audit ON auth_access_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext13_fail_audit()`);
  }
});

test("EXT-13 escrita legada recebe 410 depois das guardas", opt, async () => {
  assert.equal((await api("/api/ext/periodic-reports", { method: "POST", cookie: null, body: {} })).status, 401);
  assert.equal((await api("/api/ext/periodic-reports", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403);
  const retired = await api("/api/ext/periodic-reports", { method: "POST", body: { title: "legacy", report_type: "mensal" } });
  assert.equal(retired.status, 410);
  assert.equal(retired.body.canonical, "/api/ext/reports/periodic");
  const retiredAlias = await api("/api/ext/periodic-reports", { method: "PATCH", body: { id: report.id, status: "enviado" } });
  assert.equal(retiredAlias.status, 410);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_periodic_reports WHERE origin='registro_legado'`)).rows[0].n, 0);
});
