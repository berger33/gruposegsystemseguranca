// EXT-12 / F08 — contrato estático e unitário do editor visual canônico.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildPreviewSnapshot, createExtVisualApi } from "../src/server/ext-visual-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
const identity = "11111111-1111-4111-8111-111111111111";
const tokenId = "22222222-2222-4222-8222-222222222222";

function req({ method = "GET", url = "/api/ext/visual/tokens", body, headers = {} } = {}) {
  const stream = (async function* () {
    if (body !== undefined) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  })();
  stream.method = method;
  stream.url = url;
  stream.headers = { origin: "https://seg.test", host: "seg.test", "idempotency-key": "ext12-unit-key-001", ...headers };
  return stream;
}

function response() {
  return {
    statusCode: 200,
    body: "",
    writeHead(status) { this.statusCode = status; },
    end(body) { this.body += body || ""; },
    json() { return JSON.parse(this.body); },
  };
}

function poolForCreate({ permission = true, audit = true } = {}) {
  const statements = [];
  const client = {
    async query(text, params = []) {
      statements.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("ext_visual_editor_events") && text.includes("WHERE")) return { rows: [] };
      if (text.includes("COALESCE(MAX(version)")) return { rows: [{ version: 0 }] };
      if (text.includes("INSERT INTO ext_visual_tokens")) {
        return { rows: [{ id: tokenId, token_key: "brand.primary", category: "cores", status: "rascunho", version: 1, origin: "ext12_canonica" }] };
      }
      if (text.includes("INSERT INTO ext_editor_history")) return { rows: [] };
      if (text.includes("INSERT INTO ext_visual_editor_events")) return { rows: [] };
      if (text.includes("auth_access_audit")) {
        if (!audit) throw new Error("audit offline");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    statements,
    async query(text) {
      if (text.includes("FROM auth_permissions")) return { rows: permission ? [{ scope_type: "global", scope_id: null }] : [] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
}

const session = async () => ({ identityId: identity, role: "admin" });
const sameOrigin = () => true;

const tokenPayload = {
  token_key: "brand.primary",
  category: "cores",
  token_value: { color: "#0f4c81", contrast: "#ffffff" },
  change_summary: "Criação unitária do token visual",
};

test("EXT-12 migração 164 é aditiva e cria eventos visuais imutáveis", async () => {
  const migration = await readFile(path.join(root, "db/migrations/164-ext12-visual-editor-canonical-journey.sql"), "utf8");
  assert.match(migration, /ALTER TABLE ext_visual_tokens/);
  assert.match(migration, /ALTER TABLE ext_visual_layouts/);
  assert.match(migration, /origin IN \('registro_legado', 'ext12_canonica'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_visual_editor_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_visual_editor_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_editor_history/);
  assert.match(migration, /visual_editor\.publish/);
});

test("EXT-12 snapshot de prévia é interno e não publica site público", () => {
  const snapshot = buildPreviewSnapshot({
    layout: { id: "l1", layout_key: "home", version: 2, status: "aprovado", layout_data: { hero: "SEG" }, preview_url: "/admin/visual?preview=l1" },
    token: { id: "t1", token_key: "brand.primary", version: 1, token_value: { color: "#123456" } },
  });
  assert.equal(snapshot.publication_ready, true);
  assert.deepEqual(snapshot.tokens, { color: "#123456" });
  assert.match(snapshot.boundary, /não publica/);
});

test("EXT-12 anônimo é negado fail-closed antes de escrita", async () => {
  const pool = poolForCreate();
  const api = createExtVisualApi({ pool, sameOrigin, requireSession: async () => null });
  const res = response();
  await api.handle(req({ method: "POST", body: tokenPayload }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(pool.statements.length, 0);
});

test("EXT-12 ausência de permissão é negada mesmo com papel admin", async () => {
  const pool = poolForCreate({ permission: false });
  const api = createExtVisualApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: tokenPayload }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(pool.statements.length, 0);
});

test("EXT-12 criação exige Idempotency-Key e grava fingerprint, lock, histórico e evento", async () => {
  const pool = poolForCreate();
  const api = createExtVisualApi({ pool, sameOrigin, requireSession: session });
  const missing = response();
  await api.handle(req({ method: "POST", headers: { "idempotency-key": "" }, body: tokenPayload }), missing);
  assert.equal(missing.statusCode, 400);

  const ok = response();
  await api.handle(req({ method: "POST", body: tokenPayload }), ok);
  assert.equal(ok.statusCode, 201);
  const sql = pool.statements.map((item) => item.text).join("\n");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /INSERT INTO ext_editor_history/);
  assert.match(sql, /INSERT INTO ext_visual_editor_events/);
  assert.match(sql, /auth_access_audit/);
});

test("EXT-12 falha de auditoria responde 503 e faz rollback sem commit", async () => {
  const pool = poolForCreate({ audit: false });
  const api = createExtVisualApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: tokenPayload }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
  const sql = pool.statements.map((item) => item.text);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(sql.includes("COMMIT"), false);
});

test("EXT-12 mutação fora de same-origin é recusada", async () => {
  const pool = poolForCreate();
  const api = createExtVisualApi({ pool, sameOrigin: () => false, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: tokenPayload }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "origin_forbidden");
});

test("EXT-12 escrita legada retorna 410 depois das guardas", async () => {
  const pool = poolForCreate();
  const api = createExtVisualApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handleLegacyTokens(req({ method: "POST", url: "/api/ext/visual-tokens", body: tokenPayload }), res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.json().canonical, "/api/ext/visual/tokens");
});

test("EXT-12 servidor registra borda canônica e aposentadoria legada", async () => {
  const server = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(server, /createExtVisualApi/);
  assert.match(server, /\/api\/ext\/visual\//);
  assert.match(server, /handleLegacyTokens/);
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/visual\/"\)/);
});

test("entrada visual legada redireciona para Aparência e o editor duplicado saiu da tela", async () => {
  const page = await readFile(path.join(root, "src/app/admin/visual/page.tsx"), "utf8");
  const gate = await readFile(path.join(root, "src/app/admin/AdminGate.tsx"), "utf8");
  const nav = await readFile(path.join(root, "src/lib/admin-navigation.mjs"), "utf8");
  assert.match(page, /redirect\(['"]\/admin\/aparencia['"]\)/);
  assert.doesNotMatch(gate, /label:\s*["']Editor visual["']/);
  assert.doesNotMatch(nav, /\/admin\/visual/);
  await assert.rejects(readFile(path.join(root, "src/app/admin/visual/VisualEditorWorkspace.tsx")));
});
