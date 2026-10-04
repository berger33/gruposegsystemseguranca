// EXT-11 / F07 — contrato estático e unitário da jornada canônica.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createExtAnalyticsApi, summarizeObservations } from "../src/server/ext-analytics-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
const identity = "11111111-1111-4111-8111-111111111111";
const experiment = "22222222-2222-4222-8222-222222222222";

function req({ method = "GET", url = "/api/ext/analytics/experiments", body, headers = {} } = {}) {
  const stream = (async function* () {
    if (body !== undefined) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  })();
  stream.method = method;
  stream.url = url;
  stream.headers = { origin: "https://seg.test", host: "seg.test", "idempotency-key": "ext11-unit-key-001", ...headers };
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
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("ext_analytics_experiment_events") && text.includes("WHERE")) return { rows: [] };
      if (text.includes("INSERT INTO ext_analytics_experiments")) return { rows: [{ id: experiment, protocol: "AB-EXT-20261004-A1B2", status: "rascunho", origin: "ext11_canonica" }] };
      if (text.includes("INSERT INTO ext_analytics_experiment_events")) return { rows: [] };
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
      if (text.includes("FROM auth_permissions")) return { rows: permission ? [{ scope_type: "global" }] : [] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
}

const session = async () => ({ identityId: identity, role: "admin" });
const sameOrigin = () => true;

test("EXT-11 migração 163 é aditiva e preserva a tabela 086 como registro legado", async () => {
  const migration = await readFile(path.join(root, "db/migrations/163-ext11-analytics-canonical-journey.sql"), "utf8");
  assert.match(migration, /ALTER TABLE ext_analytics_experiments/);
  assert.match(migration, /registro_legado/);
  assert.match(migration, /ext11_canonica/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_analytics_experiment_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_analytics_observations/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_analytics_experiment_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_analytics_observations/);
});

test("EXT-11 resumo nunca inventa vencedor e distingue ausência de dados", () => {
  const empty = summarizeObservations([]);
  assert.equal(empty.sufficient_for_descriptive_view, false);
  assert.match(empty.conclusion, /insuficientes/);
  const observed = summarizeObservations([
    { variant: "A", metric_value: "3", sample_size: 10 },
    { variant: "B", metric_value: "4", sample_size: 10 },
  ]);
  assert.equal(observed.sufficient_for_descriptive_view, true);
  assert.match(observed.conclusion, /nenhuma significância/);
  assert.equal("winner" in observed, false);
});

test("EXT-11 anônimo é negado fail-closed antes da escrita", async () => {
  const api = createExtAnalyticsApi({ pool: poolForCreate(), sameOrigin, requireSession: async () => null });
  const res = response();
  await api.handle(req({ method: "POST", body: { hypothesis: "Hipótese suficientemente longa para teste unitário", description: "Descrição válida do escopo", variant_a: "Tela A", variant_b: "Tela B", metric_name: "taxa" } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(poolForCreate().statements?.length || 0, 0);
});

test("EXT-11 ausência de permissão é negada mesmo com papel admin", async () => {
  const pool = poolForCreate({ permission: false });
  const api = createExtAnalyticsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { hypothesis: "Hipótese suficientemente longa para teste unitário", description: "Descrição válida do escopo", variant_a: "Tela A", variant_b: "Tela B", metric_name: "taxa" } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(pool.statements.length, 0);
});

test("EXT-11 criação exige Idempotency-Key e usa fingerprint, lock e evento", async () => {
  const pool = poolForCreate();
  const api = createExtAnalyticsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", headers: { "idempotency-key": "" }, body: { hypothesis: "Hipótese suficientemente longa para teste unitário", description: "Descrição válida do escopo", variant_a: "Tela A", variant_b: "Tela B", metric_name: "taxa" } }), res);
  assert.equal(res.statusCode, 400);

  const ok = response();
  await api.handle(req({ method: "POST", body: { hypothesis: "Hipótese suficientemente longa para teste unitário", description: "Descrição válida do escopo", variant_a: "Tela A", variant_b: "Tela B", metric_name: "taxa" } }), ok);
  assert.equal(ok.statusCode, 201);
  const sql = pool.statements.map((item) => item.text).join("\n");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /INSERT INTO ext_analytics_experiment_events/);
  assert.match(sql, /auth_access_audit/);
});

test("EXT-11 falha da auditoria responde 503 e faz rollback sem commit", async () => {
  const pool = poolForCreate({ audit: false });
  const api = createExtAnalyticsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { hypothesis: "Hipótese suficientemente longa para teste unitário", description: "Descrição válida do escopo", variant_a: "Tela A", variant_b: "Tela B", metric_name: "taxa" } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
  const sql = pool.statements.map((item) => item.text);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(sql.includes("COMMIT"), false);
});

test("EXT-11 observações recusam resultado digitado, fonte sintética e escrita fora de same-origin", async () => {
  const pool = poolForCreate();
  const api = createExtAnalyticsApi({ pool, sameOrigin: () => false, requireSession: session });
  const cross = response();
  await api.handle(req({ method: "POST", url: `/api/ext/analytics/experiments/${experiment}/observations`, body: {} }), cross);
  assert.equal(cross.statusCode, 403);

  const apiSame = createExtAnalyticsApi({ pool, sameOrigin, requireSession: session });
  const fake = response();
  await apiSame.handle(req({ method: "POST", url: `/api/ext/analytics/experiments/${experiment}/observations`, body: { variant: "A", metric_name: "taxa", metric_value: 1, sample_size: 1, source_type: "internal_operational_record", source_reference: "synthetic-fixture", source_recorded_at: new Date().toISOString(), result: "vencedor A" } }), fake);
  assert.equal(fake.statusCode, 400);
  assert.equal(fake.json().error, "real_source_required");
});

test("EXT-11 rota legada aposenta escritas com 410 depois das guardas", async () => {
  const pool = poolForCreate();
  const api = createExtAnalyticsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handleLegacy(req({ method: "POST", url: "/api/ext/analytics-experiments", body: {} }), res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.json().error, "legacy_writer_retired");
});

test("EXT-11 servidor registra a borda canônica, o dispatcher e a aposentadoria legada", async () => {
  const server = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(server, /createExtAnalyticsApi/);
  assert.match(server, /\/api\/ext\/analytics\//);
  assert.match(server, /legacy_writer_retired/);
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/analytics\/"\)/);
});

test("EXT-11 UI é AdminGate e informa ausência de dados suficientes", async () => {
  const page = await readFile(path.join(root, "src/app/admin/analytics/page.tsx"), "utf8");
  const workspace = await readFile(path.join(root, "src/app/admin/analytics/AnalyticsWorkspace.tsx"), "utf8");
  assert.match(page, /AdminGate/);
  assert.match(page, /Analytics/);
  assert.match(workspace, /Não há dados suficientes/);
  assert.match(workspace, /não inventa tráfego/);
  assert.match(workspace, /Idempotency-Key/);
});
