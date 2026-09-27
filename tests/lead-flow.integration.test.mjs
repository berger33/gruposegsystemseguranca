import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectRoot);

const optIn = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL || "";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function skipReason() {
  if (!optIn) return "set RUN_DATABASE_INTEGRATION=1 to run the lead flow against a real PostgreSQL";
  if (!databaseUrl) return "DATABASE_URL is missing; copy .env.example to .env.local first";
  if (!loopbackHosts.has(new URL(databaseUrl).hostname) && process.env.RUN_DATABASE_INTEGRATION_REMOTE !== "1") {
    return "DATABASE_URL is not a loopback database; set RUN_DATABASE_INTEGRATION_REMOTE=1 to allow it";
  }
  return null;
}

const skip = skipReason();
const testOptions = skip ? { skip } : {};

// Next reescreve estes arquivos para apontar ao distDir isolado do teste; o conteúdo
// original é restaurado ao final para não sujar o repositório.
const GENERATED_FILES = ["next-env.d.ts", "tsconfig.json"];

async function snapshotGeneratedFiles() {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) {
    snapshot.set(name, await readFile(path.join(projectRoot, name), "utf8").catch(() => null));
  }
  return snapshot;
}

async function restoreGeneratedFiles(snapshot) {
  for (const [name, content] of snapshot) {
    if (content === null) continue;
    await writeFile(path.join(projectRoot, name), content);
  }
}

const ADMIN_TOKEN_MARCELO = "integration-token-marcelo-000000000000000000000000";
const ADMIN_TOKEN_TI = "integration-token-ti-0000000000000000000000000000";
const SESSION_SECRET = "integration-session-secret-00000000000000000000000000";

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function applyMigrations() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    for (const filename of ["001-site-visual.sql", "002-public-leads.sql"]) {
      const sql = await readFile(path.join(projectRoot, "db/migrations", filename), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

function startServer(port) {
  const child = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NEXT_DIST_DIR: ".next/integration",
      TRUST_PROXY: "false",
      SITE_VISUAL_SELECTION_ENABLED: "false",
      SITE_ADMIN_TOKEN_MARCELO: ADMIN_TOKEN_MARCELO,
      SITE_ADMIN_TOKEN_TI: ADMIN_TOKEN_TI,
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET,
      MAIL_HOST: "",
      MAIL_USER: "",
      MAIL_PASSWORD: "",
      MAIL_FROM: "",
      LEADS_NOTIFY_EMAIL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", chunk => logs.push(String(chunk)));
  child.stderr.on("data", chunk => logs.push(String(chunk)));
  return { child, logs };
}

async function waitForServer(child, logs) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs.join("")}`);
    if (logs.join("").includes("listening on")) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`server did not start in time:\n${logs.join("")}`);
}

test("lead capture works end to end against a real PostgreSQL", testOptions, async t => {
  // The migration files must be valid SQL for the configured database.
  await applyMigrations();

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const generatedFiles = await snapshotGeneratedFiles();
  const { child, logs } = startServer(port);
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    await restoreGeneratedFiles(generatedFiles);
  });

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const createdLeadIds = [];
  t.after(async () => {
    for (const id of createdLeadIds) {
      await pool.query("DELETE FROM public_leads WHERE id = $1", [id]).catch(() => {});
    }
    await pool.end();
  });

  async function api(pathname, { method = "GET", body, cookie, sendOrigin = true } = {}) {
    const headers = {};
    if (sendOrigin) headers.Origin = origin;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    return { status: response.status, body: await response.json(), setCookie };
  }

  await waitForServer(child, logs);

  const validLead = {
    requestKind: "visit",
    name: "Cliente de Teste da Integracao",
    phone: "(11) 98888-7777",
    city: "Sao Paulo",
    propertyType: "Condomínio",
    services: ["Monitoramento 24 Horas", "Monitoramento 24 Horas"],
    visitPreference: "Periodo da manha",
    details: "Pedido sintetico criado pelo teste de integracao.",
    consent: true,
  };

  await t.test("rejects a lead posted without a same-origin header", async () => {
    const response = await api("/api/leads", { method: "POST", body: validLead, sendOrigin: false });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "same_origin_required" });
  });

  await t.test("rejects unsupported services and a missing consent", async () => {
    const badService = await api("/api/leads", { method: "POST", body: { ...validLead, services: ["Servico inventado"] } });
    assert.equal(badService.status, 400);
    assert.deepEqual(badService.body, { error: "invalid_services" });

    const noConsent = await api("/api/leads", { method: "POST", body: { ...validLead, consent: false } });
    assert.equal(noConsent.status, 400);
    assert.deepEqual(noConsent.body, { error: "consent_required" });
  });

  let leadId = null;
  await t.test("records an accepted lead in PostgreSQL", async () => {
    const response = await api("/api/leads", { method: "POST", body: validLead });
    assert.equal(response.status, 201);
    assert.equal(response.body.recorded, true);
    assert.equal(response.body.emailStatus, "not_configured");
    assert.match(response.body.leadId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    leadId = response.body.leadId;
    createdLeadIds.push(leadId);

    const stored = await pool.query(
      `SELECT request_kind, name, phone, city, property_type, services, visit_preference, details, status, email_status, consented_at, created_at
       FROM public_leads WHERE id = $1`,
      [leadId],
    );
    assert.equal(stored.rowCount, 1);
    const row = stored.rows[0];
    assert.equal(row.request_kind, "visit");
    assert.equal(row.name, "Cliente de Teste da Integracao");
    assert.equal(row.city, "Sao Paulo");
    assert.equal(row.property_type, "Condomínio");
    assert.deepEqual(row.services, ["Monitoramento 24 Horas"]);
    assert.equal(row.visit_preference, "Periodo da manha");
    assert.equal(row.status, "new");
    assert.equal(row.email_status, "not_configured");
    assert.ok(row.consented_at instanceof Date);
    assert.ok(row.created_at instanceof Date);
  });

  let adminCookie = null;
  await t.test("requires a valid administrative session to read the inbox", async () => {
    const anonymous = await api("/api/admin/leads");
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.body, { error: "admin_session_required" });

    const wrongToken = await api("/api/admin/session", { method: "POST", body: { token: "token-incorreto" } });
    assert.equal(wrongToken.status, 401);
    assert.deepEqual(wrongToken.body, { error: "invalid_admin_credential" });

    const session = await api("/api/admin/session", { method: "POST", body: { token: ADMIN_TOKEN_MARCELO } });
    assert.equal(session.status, 200);
    assert.equal(session.body.role, "marcelo");
    adminCookie = session.setCookie.map(item => item.split(";")[0]).join("; ");
    assert.ok(adminCookie.startsWith("seg_admin_session="));
  });

  await t.test("lists the recorded lead and filters it by status", async () => {
    const all = await api("/api/admin/leads", { cookie: adminCookie });
    assert.equal(all.status, 200);
    assert.equal(all.body.role, "marcelo");
    assert.ok(all.body.total >= 1);
    assert.ok(all.body.leads.some(lead => lead.id === leadId));

    const pending = await api("/api/admin/leads?status=new", { cookie: adminCookie });
    assert.equal(pending.status, 200);
    assert.ok(pending.body.leads.some(lead => lead.id === leadId));

    const contacted = await api("/api/admin/leads?status=contacted", { cookie: adminCookie });
    assert.equal(contacted.status, 200);
    assert.ok(!contacted.body.leads.some(lead => lead.id === leadId));

    const unknown = await api("/api/admin/leads?status=inexistente", { cookie: adminCookie });
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.body, { error: "invalid_status_filter" });
  });

  await t.test("changes the lead status and audits who changed it", async () => {
    const updated = await api(`/api/admin/leads/${leadId}`, { method: "PATCH", body: { status: "contacted" }, cookie: adminCookie });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.status, "contacted");
    assert.equal(updated.body.updatedBy, "marcelo");

    const stored = await pool.query("SELECT status FROM public_leads WHERE id = $1", [leadId]);
    assert.equal(stored.rows[0].status, "contacted");

    const audit = await pool.query(
      "SELECT previous_status, next_status, changed_by FROM public_lead_status_audit WHERE lead_id = $1 ORDER BY id",
      [leadId],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].previous_status, "new");
    assert.equal(audit.rows[0].next_status, "contacted");
    assert.equal(audit.rows[0].changed_by, "marcelo");
  });

  await t.test("does not duplicate the audit trail when the status repeats", async () => {
    const repeated = await api(`/api/admin/leads/${leadId}`, { method: "PATCH", body: { status: "contacted" }, cookie: adminCookie });
    assert.equal(repeated.status, 200);
    const audit = await pool.query("SELECT COUNT(*)::int AS total FROM public_lead_status_audit WHERE lead_id = $1", [leadId]);
    assert.equal(audit.rows[0].total, 1);
  });

  await t.test("refuses an unknown status, a cross-origin patch and a missing lead", async () => {
    const unknownStatus = await api(`/api/admin/leads/${leadId}`, { method: "PATCH", body: { status: "inventado" }, cookie: adminCookie });
    assert.equal(unknownStatus.status, 400);
    assert.deepEqual(unknownStatus.body, { error: "invalid_status" });

    const crossOrigin = await api(`/api/admin/leads/${leadId}`, { method: "PATCH", body: { status: "closed" }, cookie: adminCookie, sendOrigin: false });
    assert.equal(crossOrigin.status, 403);
    assert.deepEqual(crossOrigin.body, { error: "same_origin_required" });

    const missing = await api("/api/admin/leads/00000000-0000-4000-8000-000000000000", { method: "PATCH", body: { status: "closed" }, cookie: adminCookie });
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { error: "lead_not_found" });

    const anonymous = await api(`/api/admin/leads/${leadId}`, { method: "PATCH", body: { status: "closed" } });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.body, { error: "admin_session_required" });
  });

  await t.test("keeps the global visual selection paused by default", async () => {
    const current = await api("/api/site-visual");
    assert.equal(current.status, 200);
    assert.equal(current.body.visual, "06");
    assert.equal(current.body.selectionEnabled, false);

    const attempt = await api("/api/site-visual", { method: "PUT", body: { visual: "03", updatedBy: "marcelo" } });
    assert.equal(attempt.status, 409);
    assert.deepEqual(attempt.body, { error: "visual_selection_paused" });
  });

  await t.test("serves the public page that hosts the lead form", async () => {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Grupo SEG System/i);
  });
});
