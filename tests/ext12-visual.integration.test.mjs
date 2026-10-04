// EXT-12 / F08 — PostgreSQL 17 descartável + servidor HTTP real.
// SQL prepara somente identidades, credenciais, grants e controles de teste;
// tokens, layouts, prévias e publicações nascem por HTTP canônico.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT12_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const uuid = () => randomUUID();
const key = (name) => `ext12-${name}-${uuid()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(init.method && init.method !== "GET" ? 60000 : 30000) });

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
let token;
let layout;

async function createStaff(role, tag) {
  const id = uuid();
  const email = `ext12-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`, [id, email, `QA EXT12 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}

async function grant(identityId, permission) {
  await pool.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,'global',$4,'admin','QA EXT12 autorização granular') ON CONFLICT DO NOTHING`,
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
      NEXT_DIST_DIR: ".next/integration-ext12",
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
  for (const permission of ["visual_editor.read", "visual_editor.write", "visual_editor.review", "visual_editor.publish"]) {
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

test("EXT-12 gate exige banco PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

test("EXT-12 cluster limpo não contém tokens/layouts canônicos", opt, async () => {
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ext_visual_tokens WHERE origin='ext12_canonica') AS tokens,
      (SELECT count(*)::int FROM ext_visual_layouts WHERE origin='ext12_canonica') AS layouts,
      (SELECT count(*)::int FROM ext_visual_editor_events) AS events`)).rows[0];
  assert.deepEqual(counts, { tokens: 0, layouts: 0, events: 0 });
  const listed = await api("/api/ext/visual/tokens");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items, []);
});

test("EXT-12 RBAC fail-closed para anônimo, cookie inválido e papel sem grant", opt, async () => {
  assert.equal((await api("/api/ext/visual/tokens", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/visual/tokens", { cookie: "seg_admin_session=invalid" })).status, 401);
  assert.equal((await api("/api/ext/visual/tokens", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/visual/tokens", { method: "POST", cookie: cookieRh, body: {} })).status, 403);
});

test("EXT-12 mutações exigem same-origin e Idempotency-Key", opt, async () => {
  const payload = { token_key: "brand.same_origin", category: "cores", token_value: { color: "#111111" }, change_summary: "Token para prova de origem" };
  assert.equal((await api("/api/ext/visual/tokens", { method: "POST", body: payload, origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/visual/tokens", { method: "POST", body: payload, idempotencyKey: null })).status, 400);
});

test("EXT-12 cria token por HTTP com versão e autoria da sessão", opt, async () => {
  const response = await api("/api/ext/visual/tokens", {
    method: "POST",
    body: { token_key: "brand.primary", category: "cores", token_value: { color: "#0f4c81", contrast: "#ffffff" }, change_summary: "Token de marca criado por HTTP canônico" },
  });
  assert.equal(response.status, 201);
  token = response.body.token;
  assert.equal(token.status, "rascunho");
  assert.equal(token.origin, "ext12_canonica");
  assert.equal(token.created_by_identity, admin.id);
  assert.equal(token.version, 1);
});

let replayKey;
let replayPayload;
test("EXT-12 replay idêntico não duplica e payload divergente conflita", opt, async () => {
  replayKey = key("replay");
  replayPayload = { token_key: "brand.replay", category: "cores", token_value: { color: "#222222" }, change_summary: "Token para prova de replay" };
  const first = await api("/api/ext/visual/tokens", { method: "POST", idempotencyKey: replayKey, body: replayPayload });
  assert.equal(first.status, 201);
  const replay = await api("/api/ext/visual/tokens", { method: "POST", idempotencyKey: replayKey, body: replayPayload });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.token.id, first.body.token.id);
  const conflict = await api("/api/ext/visual/tokens", { method: "POST", idempotencyKey: replayKey, body: { ...replayPayload, token_value: { color: "#333333" } } });
  assert.equal(conflict.status, 409);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_visual_tokens WHERE idempotency_key=$1`, [replayKey])).rows[0].n, 1);
});

test("EXT-12 cria layout por HTTP vinculado ao token e gera prévia interna", opt, async () => {
  const created = await api("/api/ext/visual/layouts", {
    method: "POST",
    cookie: cookieTi,
    body: { layout_key: "home-canonica", token_id: token.id, layout_data: { hero: "SEG System", sections: ["serviços", "contato"] }, change_summary: "Layout criado por HTTP canônico" },
  });
  assert.equal(created.status, 201);
  layout = created.body.layout;
  assert.equal(layout.created_by_identity, ti.id);
  assert.equal(layout.token_id, token.id);
  const preview = await api(`/api/ext/visual/layouts/${layout.id}/preview`, { method: "POST", body: { preview_note: "Prévia interna anterior à publicação" } });
  assert.equal(preview.status, 200);
  assert.match(preview.body.preview.boundary, /não publica/);
  assert.equal(preview.body.preview.token_key, "brand.primary");
});

test("EXT-12 máquina de estados controla aprovação e publicação de token", opt, async () => {
  const invalidPublish = await api(`/api/ext/visual/tokens/${token.id}/publish`, { method: "POST", body: { publish_note: "Tentativa sem aprovação humana." } });
  assert.equal(invalidPublish.status, 409);
  assert.equal(invalidPublish.body.error, "approval_required");
  const review = await api(`/api/ext/visual/tokens/${token.id}/transition`, { method: "POST", body: { status: "em_revisao" } });
  assert.equal(review.status, 200);
  const approved = await api(`/api/ext/visual/tokens/${token.id}/transition`, { method: "POST", body: { status: "aprovado", approval_note: "Aprovação humana sintética do token visual." } });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.token.status, "aprovado");
  const published = await api(`/api/ext/visual/tokens/${token.id}/publish`, { method: "POST", body: { publish_note: "Publicar token aprovado como versão ativa." } });
  assert.equal(published.status, 200);
  assert.equal(published.body.token.status, "publicado");
  assert.equal(published.body.token.is_published, true);
});

test("EXT-12 layout exige aprovação e prévia antes de publicar", opt, async () => {
  const early = await api(`/api/ext/visual/layouts/${layout.id}/publish`, { method: "POST", body: { publish_note: "Tentativa antes de aprovação." } });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, "approval_required");
  assert.equal((await api(`/api/ext/visual/layouts/${layout.id}/transition`, { method: "POST", body: { status: "em_revisao" } })).status, 200);
  const approved = await api(`/api/ext/visual/layouts/${layout.id}/transition`, { method: "POST", body: { status: "aprovado", approval_note: "Aprovação humana sintética do layout visual." } });
  assert.equal(approved.status, 200);
  const published = await api(`/api/ext/visual/layouts/${layout.id}/publish`, { method: "POST", body: { publish_note: "Publicar layout aprovado após prévia interna." } });
  assert.equal(published.status, 200);
  assert.equal(published.body.layout.status, "publicado");
  assert.equal(published.body.layout.is_published, true);
});

test("EXT-12 revisão cria nova versão sem sobrescrever publicada", opt, async () => {
  const revision = await api(`/api/ext/visual/layouts/${layout.id}/revisions`, {
    method: "POST",
    body: { layout_data: { hero: "SEG revisado", sections: ["serviços", "faq"] }, change_summary: "Nova versão de layout sem sobrescrever a publicada" },
  });
  assert.equal(revision.status, 201);
  assert.equal(revision.body.layout.version, 2);
  assert.equal(revision.body.layout.status, "rascunho");
  const publishedCount = (await pool.query(`SELECT count(*)::int AS n FROM ext_visual_layouts WHERE layout_key=$1 AND is_published`, [layout.layout_key])).rows[0].n;
  assert.equal(publishedCount, 1);
});

test("EXT-12 concorrência com mesma chave cria um único layout", opt, async () => {
  const same = key("concurrent");
  const payload = { layout_key: "concorrente", layout_data: { hero: "Concorrência" }, change_summary: "Layout concorrente controlado" };
  const results = await Promise.all([
    api("/api/ext/visual/layouts", { method: "POST", idempotencyKey: same, body: payload }),
    api("/api/ext/visual/layouts", { method: "POST", idempotencyKey: same, body: payload }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort((a, b) => a - b), [200, 201]);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ext_visual_layouts WHERE idempotency_key=$1`, [same])).rows[0].n, 1);
});

test("EXT-12 eventos e histórico são append-only no PostgreSQL", opt, async () => {
  await assert.rejects(() => pool.query(`UPDATE ext_visual_editor_events SET summary='alterado' WHERE layout_id=$1`, [layout.id]));
  await assert.rejects(() => pool.query(`DELETE FROM ext_editor_history WHERE layout_id=$1`, [layout.id]));
});

test("EXT-12 falha de auditoria retorna 503 e rollback completo", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext12_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ext12_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext12_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ext12_fail_audit()`);
  const tokenKey = "brand.rollback";
  try {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM ext_visual_tokens WHERE token_key=$1`, [tokenKey])).rows[0].n;
    const failed = await api("/api/ext/visual/tokens", { method: "POST", body: { token_key: tokenKey, category: "cores", token_value: { color: "#999999" }, change_summary: "Token que deve sofrer rollback" } });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "audit_unavailable");
    const after = (await pool.query(`SELECT count(*)::int AS n FROM ext_visual_tokens WHERE token_key=$1`, [tokenKey])).rows[0].n;
    assert.equal(after, before);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext12_fail_audit ON auth_access_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext12_fail_audit()`);
  }
});

test("EXT-12 escrita legada recebe 410 depois das guardas", opt, async () => {
  assert.equal((await api("/api/ext/visual-tokens", { method: "POST", cookie: null, body: {} })).status, 401);
  assert.equal((await api("/api/ext/visual-layouts", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403);
  const retiredToken = await api("/api/ext/visual-tokens", { method: "POST", body: { token_key: "legacy", category: "cores", token_value: { color: "#000" } } });
  assert.equal(retiredToken.status, 410);
  assert.equal(retiredToken.body.canonical, "/api/ext/visual/tokens");
  const retiredLayout = await api("/api/ext/visual-layouts", { method: "POST", body: { layout_key: "legacy", layout_data: { hero: "não" } } });
  assert.equal(retiredLayout.status, 410);
  assert.equal(retiredLayout.body.canonical, "/api/ext/visual/layouts");
});
