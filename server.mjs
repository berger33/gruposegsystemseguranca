import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import nextEnv from "@next/env";
import next from "next";
import pg from "pg";

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
const loginAttempts = new Map();
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

function rateLimitAllows(req) {
  const forwardedFor = process.env.TRUST_PROXY === "true" ? req.headers["x-forwarded-for"] : undefined;
  const ip = String(forwardedFor || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const current = (loginAttempts.get(ip) || []).filter(timestamp => now - timestamp < LOGIN_WINDOW_MS);
  if (current.length >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.set(ip, current);
    return false;
  }
  current.push(now);
  loginAttempts.set(ip, current);
  return true;
}

async function handleSiteVisual(req, res, url) {
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
  if (!rateLimitAllows(req)) return json(res, 429, { error: "too_many_attempts" }, { "Retry-After": "900" });

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
  if (url.pathname === "/api/admin/session") return handleAdminSession(req, res);
  return json(res, 404, { error: "not_found" });
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (pathname === "/api/site-visual" || pathname === "/api/admin/session") {
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
