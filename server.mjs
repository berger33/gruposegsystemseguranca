import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import nextEnv from "@next/env";
import next from "next";
import pg from "pg";
import nodemailer from "nodemailer";
import { validateLeadInput } from "./src/lib/public-lead-validation.mjs";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
loadEnvConfig(process.cwd());
const DEFAULT_VISUAL = "06";
const VISUAL_IDS = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
const SESSION_COOKIE = "seg_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 8 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LEAD_WINDOW_MS = 10 * 60 * 1000;
const LEAD_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();
const leadAttempts = new Map();
const leadStatuses = new Set(["new", "contacted", "closed"]);
let pool;

const dev = process.argv.includes("--dev");
if (!dev && !process.env.NODE_ENV) process.env.NODE_ENV = "production";
const hostname = process.env.BIND_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "grupo-seg-system-site",
    });
  }
  return pool;
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const forwardedHost = process.env.TRUST_PROXY === "true" ? req.headers["x-forwarded-host"] : undefined;
  const expectedHost = String(forwardedHost || req.headers.host || "").split(",")[0].trim().toLowerCase();
  if (!origin || !expectedHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function constantTimeTextMatch(received, expected) {
  if (!received || !expected) return false;
  const receivedDigest = createHash("sha256").update(String(received)).digest();
  const expectedDigest = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

function sessionSecret() {
  const value = process.env.SITE_ADMIN_SESSION_SECRET || "";
  return value.length >= 32 ? value : null;
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSession(role) {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
  return { value: `${payload}.${sign(payload, secret)}`, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 };
}

function readSession(req) {
  const secret = sessionSecret();
  if (!secret) return null;
  const cookieHeader = String(req.headers.cookie || "");
  const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const value = cookie.slice(SESSION_COOKIE.length + 1);
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  if (!constantTimeTextMatch(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!["marcelo", "ti"].includes(parsed.role) || !Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) return null;
    return { role: parsed.role, expiresAt: parsed.exp };
  } catch {
    return null;
  }
}

function cookieSecure(req) {
  const forwardedProto = process.env.TRUST_PROXY === "true"
    ? String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase()
    : "";
  return process.env.NODE_ENV === "production" || forwardedProto === "https";
}

function sessionCookie(req, value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure(req) ? "; Secure" : ""}`;
}

function rateLimitAllows(bucket, req, windowMs, maxAttempts) {
  const forwardedFor = process.env.TRUST_PROXY === "true" ? req.headers["x-forwarded-for"] : undefined;
  const ip = String(forwardedFor || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const current = (bucket.get(ip) || []).filter(timestamp => now - timestamp < windowMs);
  if (current.length >= maxAttempts) {
    bucket.set(ip, current);
    return false;
  }
  current.push(now);
  bucket.set(ip, current);
  return true;
}

async function sendLeadEmail(lead, leadId) {
  const { MAIL_HOST, MAIL_FROM, LEADS_NOTIFY_EMAIL } = process.env;
  if (!MAIL_HOST || !MAIL_FROM || !LEADS_NOTIFY_EMAIL) return "not_configured";
  const port = Number(process.env.MAIL_PORT || 587);
  const auth = process.env.MAIL_USER && process.env.MAIL_PASSWORD
    ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
    : undefined;
  const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port,
    secure: process.env.MAIL_SECURE === "true" || port === 465,
    auth,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  });
  const label = lead.requestKind === "visit" ? "Visita técnica solicitada" : "Pedido de orçamento";
  const lines = [
    label,
    `Referência: ${leadId}`,
    `Nome: ${lead.name}`,
    `Telefone: ${lead.phone}`,
    `Cidade/bairro: ${lead.city}`,
    `Tipo de local: ${lead.propertyType}`,
    `Serviços de interesse: ${lead.services.length ? lead.services.join(", ") : "Gostaria de orientação"}`,
    ...(lead.visitPreference ? [`Preferência de visita: ${lead.visitPreference}`] : []),
    `Detalhes: ${lead.details || "Não informado"}`,
  ];
  await transporter.sendMail({
    from: MAIL_FROM,
    to: LEADS_NOTIFY_EMAIL,
    subject: `${label} — ${leadId.slice(0, 8)}`,
    text: lines.join("\n"),
  });
  return "sent";
}

async function handleCreateLead(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  if (!rateLimitAllows(leadAttempts, req, LEAD_WINDOW_MS, LEAD_MAX_ATTEMPTS)) {
    return json(res, 429, { error: "too_many_requests" }, { "Retry-After": "600" });
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "invalid_request" });
  }
  if (typeof body?.website === "string" && body.website.trim()) return json(res, 202, { accepted: true, spamIgnored: true });
  const validated = validateLeadInput(body);
  if (validated.error) return json(res, 400, { error: validated.error });
  const lead = validated.value;
  const id = randomUUID();
  let database;
  try {
    database = getPool();
    await database.query(
      `INSERT INTO public_leads
        (id, request_kind, name, phone, city, property_type, services, visit_preference, details, consented_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [id, lead.requestKind, lead.name, lead.phone, lead.city, lead.propertyType, lead.services, lead.visitPreference, lead.details],
    );
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not record the public lead.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "lead_storage_unavailable" });
  }

  let emailStatus = "not_configured";
  try {
    emailStatus = await sendLeadEmail(lead, id);
  } catch (error) {
    emailStatus = "failed";
    console.error("Lead notification email failed.", { leadId: id, message: error instanceof Error ? error.message : "unknown" });
  }
  if (emailStatus !== "not_configured") {
    await database.query("UPDATE public_leads SET email_status = $2, updated_at = NOW() WHERE id = $1", [id, emailStatus]).catch(error => {
      console.error("Could not update lead notification status.", { leadId: id, message: error instanceof Error ? error.message : "unknown" });
    });
  }
  return json(res, 201, { leadId: id, emailStatus, recorded: true });
}

async function handleAdminLeads(req, res, url) {
  const session = readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const offset = Math.min(10_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  const status = url.searchParams.get("status");
  if (status && !leadStatuses.has(status)) return json(res, 400, { error: "invalid_status_filter" });
  try {
    const values = [];
    let where = "";
    if (status) {
      values.push(status);
      where = "WHERE status = $1";
    }
    const count = await getPool().query(`SELECT COUNT(*)::int AS total FROM public_leads ${where}`, values);
    const listValues = [...values, limit, offset];
    const limitPos = values.length + 1;
    const offsetPos = values.length + 2;
    const result = await getPool().query(
      `SELECT id, request_kind, name, phone, city, property_type, services, visit_preference, details, status, email_status, created_at, updated_at
       FROM public_leads ${where} ORDER BY created_at DESC LIMIT $${limitPos} OFFSET $${offsetPos}`,
      listValues,
    );
    return json(res, 200, { leads: result.rows, total: count.rows[0]?.total || 0, limit, offset, role: session.role });
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not load the admin lead inbox.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "leads_unavailable" });
  }
}

async function handleAdminLeadStatus(req, res, leadId) {
  if (req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" }, { Allow: "PATCH" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  const session = readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) return json(res, 400, { error: "invalid_lead_id" });
  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "invalid_request" });
  }
  if (!leadStatuses.has(body?.status)) return json(res, 400, { error: "invalid_status" });
  let client;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM public_leads WHERE id = $1 FOR UPDATE", [leadId]);
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return json(res, 404, { error: "lead_not_found" });
    }
    const previousStatus = current.rows[0].status;
    if (previousStatus !== body.status) {
      await client.query("UPDATE public_leads SET status = $2, updated_at = NOW() WHERE id = $1", [leadId, body.status]);
      await client.query(
        "INSERT INTO public_lead_status_audit (lead_id, previous_status, next_status, changed_by) VALUES ($1,$2,$3,$4)",
        [leadId, previousStatus, body.status, session.role],
      );
    }
    await client.query("COMMIT");
    return json(res, 200, { leadId, status: body.status, updatedBy: session.role });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured) console.error("Could not update lead status.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "lead_update_unavailable" });
  } finally {
    client?.release();
  }
}

async function handleSiteVisual(req, res, url) {
  const selectionEnabled = process.env.SITE_VISUAL_SELECTION_ENABLED === "true";
  if (req.method === "GET" && !selectionEnabled) {
    return json(res, 200, { visual: DEFAULT_VISUAL, updatedBy: null, updatedAt: null, source: "default", selectionEnabled: false });
  }
  if (req.method === "PUT" && !selectionEnabled) {
    return json(res, 409, { error: "visual_selection_paused" });
  }
  if (req.method === "GET") {
    try {
      const result = await getPool().query(
        "SELECT active_visual, updated_by, updated_at FROM site_visual_config WHERE singleton_id = 1",
      );
      const row = result.rows[0];
      return json(res, 200, {
        visual: row?.active_visual || DEFAULT_VISUAL,
        updatedBy: row?.updated_by || null,
        updatedAt: row?.updated_at || null,
        source: "postgres",
        selectionEnabled: true,
      });
    } catch (error) {
      const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
      if (!unconfigured) console.error("Could not load the site visual configuration.", error);
      return json(res, 503, { error: unconfigured ? "database_not_configured" : "database_unavailable" });
    }
  }

  if (req.method !== "PUT") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PUT" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  const session = readSession(req);
  if (!session) return json(res, 401, { error: "admin_session_required" });

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "invalid_request" });
  }
  const visual = String(body?.visual || "");
  if (!VISUAL_IDS.has(visual)) return json(res, 400, { error: "invalid_visual_id" });

  let client;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT active_visual FROM site_visual_config WHERE singleton_id = 1 FOR UPDATE",
    );
    if (!current.rows[0]) throw new Error("SITE_VISUAL_MIGRATION_REQUIRED");
    const previousVisual = current.rows[0].active_visual;
    const updated = await client.query(
      "UPDATE site_visual_config SET active_visual = $1, updated_by = $2, updated_at = NOW() WHERE singleton_id = 1 RETURNING active_visual, updated_by, updated_at",
      [visual, session.role],
    );
    await client.query(
      "INSERT INTO site_visual_audit (previous_visual, next_visual, changed_by) VALUES ($1, $2, $3)",
      [previousVisual, visual, session.role],
    );
    await client.query("COMMIT");
    return json(res, 200, {
      visual: updated.rows[0].active_visual,
      updatedBy: updated.rows[0].updated_by,
      updatedAt: updated.rows[0].updated_at,
      source: "postgres",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error instanceof Error && error.message === "SITE_VISUAL_MIGRATION_REQUIRED";
    if (!unconfigured) console.error("Could not save the site visual configuration.", error);
    return json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "database_unavailable" });
  } finally {
    client?.release();
  }
}

async function handleAdminSession(req, res) {
  if (req.method === "GET") {
    const session = readSession(req);
    return session
      ? json(res, 200, { role: session.role, expiresAt: session.expiresAt })
      : json(res, 401, { error: "admin_session_required" });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
    return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST, DELETE" });
  if (!sameOrigin(req)) return json(res, 403, { error: "same_origin_required" });
  if (!rateLimitAllows(loginAttempts, req, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS)) return json(res, 429, { error: "too_many_attempts" }, { "Retry-After": "900" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "invalid_request" });
  }
  const token = String(body?.token || "");
  const secret = sessionSecret();
  if (!secret) return json(res, 503, { error: "admin_auth_not_configured" });
  const credentials = [
    ["marcelo", process.env.SITE_ADMIN_TOKEN_MARCELO],
    ["ti", process.env.SITE_ADMIN_TOKEN_TI],
  ];
  if (!credentials.some(([, value]) => value && value.length >= 32)) {
    return json(res, 503, { error: "admin_auth_not_configured" });
  }
  const match = credentials.find(([, value]) => value && value.length >= 32 && constantTimeTextMatch(token, value));
  if (!match) return json(res, 401, { error: "invalid_admin_credential" });

  const session = createSession(match[0]);
  return json(res, 200, { role: match[0], expiresAt: session.expiresAt }, {
    "Set-Cookie": sessionCookie(req, session.value, SESSION_TTL_SECONDS),
  });
}

async function routeApi(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/site-visual") return handleSiteVisual(req, res, url);
  if (url.pathname === "/api/leads") return handleCreateLead(req, res);
  if (url.pathname === "/api/admin/session") return handleAdminSession(req, res);
  if (url.pathname === "/api/admin/leads") return handleAdminLeads(req, res, url);
  const leadMatch = url.pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/i);
  if (leadMatch) return handleAdminLeadStatus(req, res, leadMatch[1]);
  return json(res, 404, { error: "not_found" });
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (pathname === "/api/site-visual" || pathname === "/api/leads" || pathname === "/api/admin/session" || pathname === "/api/admin/leads" || pathname.startsWith("/api/admin/leads/")) {
    await routeApi(req, res);
    return;
  }
  await handle(req, res);
});

const upgradeHandler = app.getUpgradeHandler();
server.on("upgrade", (req, socket, head) => upgradeHandler(req, socket, head));
server.listen(port, hostname, () => {
  console.log(`Grupo SEG System ${dev ? "dev" : "server"} listening on http://${hostname}:${port}`);
});
