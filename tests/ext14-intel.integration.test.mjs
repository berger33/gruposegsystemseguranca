// EXT-14 / F10 — PostgreSQL 17 descartável + servidor HTTP real.
// SQL prepara somente identidades, credenciais, grants e controles de teste;
// sugestões, evidências, aprovações e contatos registrados nascem por HTTP
// canônico. O dado-fonte comercial usado na evidência nasce pela rota pública
// real /api/leads, nunca por INSERT SQL de negócio.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";
import { chromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT14_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const uuid = () => randomUUID();
const key = (name) => `ext14-${name}-${uuid()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(init.method && init.method !== "GET" ? 60000 : 30000) });

const today = new Date().toISOString().slice(0, 10);
const historyStart = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

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
let intel;

async function createStaff(role, tag) {
  const id = uuid();
  const email = `ext14-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`, [id, email, `QA EXT14 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}

async function grant(identityId, permission) {
  await pool.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,'global',$4,'admin','QA EXT14 autorização granular') ON CONFLICT DO NOTHING`,
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

const suggestionPayload = (overrides = {}) => ({
  title: "Indicação com histórico comercial recente",
  intel_type: "indicacao",
  description: "Leads públicos e contatos CRM recentes sugerem potencial de indicação qualificada.",
  justification: "Baseada no volume real de leads públicos e contatos CRM dentro da janela declarada.",
  history_start: historyStart,
  history_end: today,
  ...overrides,
});

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
      NEXT_DIST_DIR: ".next/integration-ext14",
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
  for (const permission of ["intel.read", "intel.write", "intel.review", "intel.contact"]) {
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

test("EXT-14 gate exige banco PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

test("EXT-14 cluster limpo não contém sugestões canônicas", opt, async () => {
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ext_commercial_intelligence WHERE origin='ext14_canonica') AS intel,
      (SELECT count(*)::int FROM ext_intel_events) AS events`)).rows[0];
  assert.deepEqual(counts, { intel: 0, events: 0 });
  const listed = await api("/api/ext/intel/suggestions");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items, []);
});

test("EXT-14 RBAC fail-closed para anônimo, cookie inválido e papel sem grant", opt, async () => {
  assert.equal((await api("/api/ext/intel/suggestions", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/intel/suggestions", { cookie: "seg_admin_session=invalid" })).status, 401);
  assert.equal((await api("/api/ext/intel/suggestions", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/intel/suggestions", { method: "POST", cookie: cookieRh, body: {} })).status, 403);
});

test("EXT-14 mutações exigem same-origin e Idempotency-Key", opt, async () => {
  assert.equal((await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload(), origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload(), idempotencyKey: null })).status, 400);
});

test("EXT-14 validações recusam tipo sem fonte, janela invertida e justificativa curta", opt, async () => {
  const badType = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload({ intel_type: "outro" }) });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error, "invalid_intel_type");
  const badWindow = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload({ history_start: today, history_end: historyStart }) });
  assert.equal(badWindow.status, 400);
  assert.equal(badWindow.body.error, "invalid_history_window");
  const badJustification = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload({ justification: "curta" }) });
  assert.equal(badJustification.status, 400);
  assert.equal(badJustification.body.error, "justification_required");
  const badClient = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload({ related_client_account_id: uuid() }) });
  assert.equal(badClient.status, 409);
  assert.equal(badClient.body.error, "client_account_not_found");
});

test("EXT-14 cria sugestão por HTTP com protocolo, autoria e janela declarada", opt, async () => {
  const response = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload() });
  assert.equal(response.status, 201);
  intel = response.body.intel;
  assert.equal(intel.status, "sugerida");
  assert.equal(intel.origin, "ext14_canonica");
  assert.equal(intel.created_by_identity, admin.id);
  assert.match(intel.protocol, /^INTEL-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(intel.is_human_approved, false);
});

test("EXT-14 replay idêntico não duplica e payload divergente conflita", opt, async () => {
  const replayKey = key("replay");
  const payload = suggestionPayload({ title: "Sugestão para prova de replay", intel_type: "upsell" });
  const first = await api("/api/ext/intel/suggestions", { method: "POST", idempotencyKey: replayKey, body: payload });
  assert.equal(first.status, 201);
  const replay = await api("/api/ext/intel/suggestions", { method: "POST", idempotencyKey: replayKey, body: payload });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.intel.id, first.body.intel.id);
  const conflict = await api("/api/ext/intel/suggestions", { method: "POST", idempotencyKey: replayKey, body: { ...payload, title: "Sugestão divergente no replay" } });
  assert.equal(conflict.status, 409);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_commercial_intelligence WHERE idempotency_key=$1`, [replayKey])).rows[0].n, 1);
});

test("EXT-14 aprovação exige evidência contada anterior e justificativa", opt, async () => {
  assert.equal((await api(`/api/ext/intel/suggestions/${intel.id}/transition`, { method: "POST", body: { status: "em_analise" } })).status, 200);
  const noNote = await api(`/api/ext/intel/suggestions/${intel.id}/transition`, { method: "POST", body: { status: "aprovada" } });
  assert.equal(noNote.status, 400);
  assert.equal(noNote.body.error, "justification_required");
  const noEvidence = await api(`/api/ext/intel/suggestions/${intel.id}/transition`, { method: "POST", body: { status: "aprovada", decision_note: "Tentativa de aprovação sem evidência contada." } });
  assert.equal(noEvidence.status, 409);
  assert.equal(noEvidence.body.error, "evidence_required");
  const invalid = await api(`/api/ext/intel/suggestions/${intel.id}/transition`, { method: "POST", body: { status: "contato_registrado" } });
  assert.equal(invalid.status, 400);
});

test("EXT-14 lead público por HTTP vira histórico real da evidência", opt, async () => {
  const lead = await fetchTimeout(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      requestKind: "quote",
      name: "QA EXT14 Lead",
      phone: "(11) 97777-6666",
      city: "Guarulhos",
      propertyType: "Condomínio",
      services: ["Segurança Desarmada"],
      details: "Pedido sintético do gate EXT-14.",
      consent: true,
    }),
  });
  assert.ok([200, 201].includes(lead.status), `lead público falhou: ${lead.status}`);
});

test("EXT-14 evidência conta fontes internas e confere com o SQL", opt, async () => {
  const built = await api(`/api/ext/intel/suggestions/${intel.id}/evidence`, { method: "POST", cookie: cookieTi, body: { evidence_note: "Evidência contada no gate EXT-14." } });
  assert.equal(built.status, 200);
  const row = built.body.intel;
  assert.equal(String(row.evidence_fingerprint).length, 64);
  assert.equal(row.evidence_built_by_identity, ti.id);
  const evidence = built.body.evidence;
  assert.deepEqual(Object.keys(evidence.sources).sort(), ["crm_contacts", "public_leads"]);
  for (const table of ["public_leads", "crm_contacts"]) {
    const counted = (await pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
      [historyStart, today],
    )).rows[0].n;
    assert.equal(evidence.sources[table], counted, `total divergente para ${table}`);
  }
  assert.ok(evidence.sources.public_leads >= 1, "o lead público criado por HTTP deve entrar na contagem");
  assert.equal(evidence.total_records, evidence.sources.public_leads + evidence.sources.crm_contacts);
});

test("EXT-14 aprovação humana registra identidade e justificativa", opt, async () => {
  const approved = await api(`/api/ext/intel/suggestions/${intel.id}/transition`, { method: "POST", cookie: cookieTi, body: { status: "aprovada", decision_note: "Aprovação humana sintética da sugestão comercial." } });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.intel.status, "aprovada");
  assert.equal(approved.body.intel.approved_by_identity, ti.id);
  assert.equal(approved.body.intel.is_human_approved, true);
  assert.ok(approved.body.intel.approved_at);
});

test("EXT-14 contato sem aprovação humana anterior é recusado", opt, async () => {
  const pending = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload({ title: "Sugestão sem aprovação para contato", intel_type: "reativacao" }) });
  assert.equal(pending.status, 201);
  const refused = await api(`/api/ext/intel/suggestions/${pending.body.intel.id}/contact`, { method: "POST", body: { contact_note: "Tentativa de contato sem aprovação humana." } });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "approval_required");
});

test("EXT-14 contato registrado é interno, autorizado e sem mensagem externa", opt, async () => {
  const contacted = await api(`/api/ext/intel/suggestions/${intel.id}/contact`, { method: "POST", body: { contact_note: "Contato registrado internamente no gate EXT-14." } });
  assert.equal(contacted.status, 200);
  assert.equal(contacted.body.intel.status, "contato_registrado");
  assert.equal(contacted.body.intel.contact_registered_by_identity, admin.id);
  assert.ok(contacted.body.intel.contact_registered_at);
  assert.match(contacted.body.note, /nenhuma mensagem externa/);
  const detail = await api(`/api/ext/intel/suggestions/${intel.id}`);
  assert.equal(detail.status, 200);
  const contact = detail.body.events.find((event) => event.event_type === "intel_contact_registered");
  assert.ok(contact);
  assert.match(contact.payload.boundary, /nenhum contato externo/);
});

test("EXT-14 concorrência com mesma chave cria uma única sugestão", opt, async () => {
  const same = key("concurrent");
  const payload = suggestionPayload({ title: "Sugestão concorrente controlada", intel_type: "risco" });
  const results = await Promise.all([
    api("/api/ext/intel/suggestions", { method: "POST", idempotencyKey: same, body: payload }),
    api("/api/ext/intel/suggestions", { method: "POST", idempotencyKey: same, body: payload }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort((a, b) => a - b), [200, 201]);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_commercial_intelligence WHERE idempotency_key=$1`, [same])).rows[0].n, 1);
});

test("EXT-14 eventos são append-only no PostgreSQL", opt, async () => {
  await assert.rejects(() => pool.query(`UPDATE ext_intel_events SET summary='alterado' WHERE intel_id=$1`, [intel.id]));
  await assert.rejects(() => pool.query(`DELETE FROM ext_intel_events WHERE intel_id=$1`, [intel.id]));
});

test("EXT-14 falha de auditoria retorna 503 e rollback completo", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext14_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ext14_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext14_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ext14_fail_audit()`);
  try {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM ext_commercial_intelligence WHERE origin='ext14_canonica'`)).rows[0].n;
    const failed = await api("/api/ext/intel/suggestions", { method: "POST", body: suggestionPayload({ title: "Sugestão que deve sofrer rollback", intel_type: "cross_sell" }) });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "audit_unavailable");
    const after = (await pool.query(`SELECT count(*)::int AS n FROM ext_commercial_intelligence WHERE origin='ext14_canonica'`)).rows[0].n;
    assert.equal(after, before);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext14_fail_audit ON auth_access_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext14_fail_audit()`);
  }
});

test("EXT-14 escrita legada recebe 410 depois das guardas", opt, async () => {
  assert.equal((await api("/api/ext/commercial-intelligence", { method: "POST", cookie: null, body: {} })).status, 401);
  assert.equal((await api("/api/ext/commercial-intelligence", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403);
  const retired = await api("/api/ext/commercial-intelligence", { method: "POST", body: { title: "legacy", intel_type: "oportunidade" } });
  assert.equal(retired.status, 410);
  assert.equal(retired.body.canonical, "/api/ext/intel/suggestions");
  const retiredPatch = await api("/api/ext/commercial-intelligence", { method: "PATCH", body: { id: intel.id, status: "aprovada" } });
  assert.equal(retiredPatch.status, 410);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_commercial_intelligence WHERE origin='registro_legado'`)).rows[0].n, 0);
});



test("UX-07 inteligência browser: h1 real, falha honesta e abas acessíveis", opt, async () => {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let browser;
    try {
      browser = await chromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: [...packagedChromium.args.filter(arg => arg !== "--disable-web-security"), "--single-process"] });
      const context = await browser.newContext();
      await context.addCookies([{ name: "seg_admin_session", value: cookieAdmin.split("=")[1], url: base }]);
      const page = await context.newPage();
      await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (...args) => String(args[0]).includes("/api/ext/intel/suggestions")
          ? Promise.resolve(new Response(JSON.stringify({ error: "database_error" }), { status: 503, headers: { "content-type": "application/json" } }))
          : original(...args);
      });
      await page.goto(`${base}/admin/inteligencia`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Inteligência comercial" }).waitFor();
      await page.getByRole("tab", { name: "Sugestões canônicas" }).click();
      assert.match(await page.locator('[data-ui-state="error"]').innerText(), /Dados indisponíveis/);
      await page.getByRole("tab", { name: "Nova sugestão" }).focus();
      await page.keyboard.press("End");
      assert.equal(await page.getByRole("tab", { name: "Sugestões canônicas" }).getAttribute("aria-selected"), "true");
      await browser.close(); return;
    } catch (error) { last = error; await browser?.close().catch(() => {}); if (!String(error?.message || error).includes("ERR_ASSERTION")) throw error; }
  }
  throw last;
});
