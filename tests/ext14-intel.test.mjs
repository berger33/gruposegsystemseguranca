// EXT-14 / F10 — contrato estático e unitário da inteligência comercial canônica.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { INTEL_SOURCES, buildEvidenceSnapshot, createExtIntelApi } from "../src/server/ext-intel-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
const identity = "11111111-1111-4111-8111-111111111111";
const intelId = "22222222-2222-4222-8222-222222222222";

function req({ method = "GET", url = "/api/ext/intel/suggestions", body, headers = {} } = {}) {
  const stream = (async function* () {
    if (body !== undefined) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  })();
  stream.method = method;
  stream.url = url;
  stream.headers = { origin: "https://seg.test", host: "seg.test", "idempotency-key": "ext14-unit-key-001", ...headers };
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
      if (text.includes("FROM ext_intel_events") && text.includes("FOR UPDATE")) return { rows: [] };
      if (text.includes("INSERT INTO ext_commercial_intelligence")) {
        return { rows: [{ id: intelId, protocol: "INTEL-EXT-20261004-ABCD", title: "Reativação com histórico comprovado", intel_type: "indicacao", status: "sugerida", origin: "ext14_canonica" }] };
      }
      if (text.includes("INSERT INTO ext_intel_events")) return { rows: [] };
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

const intelPayload = {
  title: "Indicação com histórico comercial recente",
  intel_type: "indicacao",
  description: "Leads e contatos recentes sugerem potencial de indicação qualificada.",
  justification: "Baseada no volume real de leads públicos e contatos CRM da janela declarada.",
  history_start: "2026-09-01",
  history_end: "2026-09-30",
};

test("EXT-14 migração 166 é aditiva e cria eventos de inteligência imutáveis", async () => {
  const migration = await readFile(path.join(root, "db/migrations/166-ext14-intel-canonical-journey.sql"), "utf8");
  assert.match(migration, /ALTER TABLE ext_commercial_intelligence/);
  assert.match(migration, /origin IN \('registro_legado', 'ext14_canonica'\)/);
  assert.match(migration, /ALTER TYPE ext_intel_status ADD VALUE IF NOT EXISTS 'contato_registrado'/);
  assert.match(migration, /ALTER TYPE ext_intel_status ADD VALUE IF NOT EXISTS 'arquivada'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_intel_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_intel_events/);
  assert.match(migration, /intel\.contact/);
  // Aditiva: nenhuma reescrita retroativa de dados legados.
  assert.doesNotMatch(migration, /UPDATE ext_commercial_intelligence\s/);
  assert.doesNotMatch(migration, /DELETE FROM ext_commercial_intelligence/);
});

test("EXT-14 fontes por tipo são tabelas internas reais e fixas", () => {
  assert.deepEqual(Object.keys(INTEL_SOURCES).sort(), ["cross_sell", "indicacao", "oportunidade", "reativacao", "risco", "upsell"]);
  assert.deepEqual([...INTEL_SOURCES.indicacao], ["public_leads", "crm_contacts"]);
  assert.deepEqual([...INTEL_SOURCES.reativacao], ["client_tickets", "crm_contacts"]);
  assert.deepEqual([...INTEL_SOURCES.risco], ["client_tickets", "ext_quality_nonconformities"]);
});

test("EXT-14 snapshot de evidência é rastreável por fonte e declara fronteira", () => {
  const evidence = buildEvidenceSnapshot({
    intelType: "indicacao",
    historyStart: "2026-09-01",
    historyEnd: "2026-09-30",
    counts: { public_leads: 4, crm_contacts: 3 },
  });
  assert.deepEqual(evidence.sources, { public_leads: 4, crm_contacts: 3 });
  assert.equal(evidence.total_records, 7);
  assert.match(evidence.boundary, /nenhum contato externo/);
  assert.match(evidence.method, /COUNT/);
});

test("EXT-14 anônimo é negado fail-closed antes de escrita", async () => {
  const pool = poolForCreate();
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: async () => null });
  const res = response();
  await api.handle(req({ method: "POST", body: intelPayload }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(pool.statements.length, 0);
});

test("EXT-14 ausência de permissão é negada mesmo com papel admin", async () => {
  const pool = poolForCreate({ permission: false });
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: intelPayload }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(pool.statements.length, 0);
});

test("EXT-14 criação exige Idempotency-Key e grava fingerprint, lock e evento", async () => {
  const pool = poolForCreate();
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: session });
  const missing = response();
  await api.handle(req({ method: "POST", headers: { "idempotency-key": "" }, body: intelPayload }), missing);
  assert.equal(missing.statusCode, 400);

  const ok = response();
  await api.handle(req({ method: "POST", body: intelPayload }), ok);
  assert.equal(ok.statusCode, 201);
  const sql = pool.statements.map((item) => item.text).join("\n");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /INSERT INTO ext_intel_events/);
  assert.match(sql, /auth_access_audit/);
});

test("EXT-14 tipo sem fonte interna confirmada é recusado", async () => {
  const pool = poolForCreate();
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { ...intelPayload, intel_type: "outro" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_intel_type");
});

test("EXT-14 sugestão sem justificativa explicada é recusada", async () => {
  const pool = poolForCreate();
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { ...intelPayload, justification: "curta" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "justification_required");
});

test("EXT-14 falha de auditoria responde 503 e faz rollback sem commit", async () => {
  const pool = poolForCreate({ audit: false });
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: intelPayload }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
  const sql = pool.statements.map((item) => item.text);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(sql.includes("COMMIT"), false);
});

test("EXT-14 mutação fora de same-origin é recusada", async () => {
  const pool = poolForCreate();
  const api = createExtIntelApi({ pool, sameOrigin: () => false, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: intelPayload }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "origin_forbidden");
});

test("EXT-14 escrita legada retorna 410 depois das guardas", async () => {
  const pool = poolForCreate();
  const api = createExtIntelApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handleLegacy(req({ method: "POST", url: "/api/ext/commercial-intelligence", body: intelPayload }), res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.json().canonical, "/api/ext/intel/suggestions");
});

test("EXT-14 servidor registra borda canônica e aposentadoria legada", async () => {
  const server = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(server, /createExtIntelApi/);
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/intel\/"\)/);
  assert.match(server, /extIntelApi\.handleLegacy/);
  assert.doesNotMatch(server, /extReportingApi\.handleCommercialIntelligence/);
});

test("EXT-14 UI é AdminGate e declara contato interno sem mensagem externa", async () => {
  const page = await readFile(path.join(root, "src/app/admin/inteligencia/page.tsx"), "utf8");
  const workspace = await readFile(path.join(root, "src/app/admin/inteligencia/IntelWorkspace.tsx"), "utf8");
  assert.match(page, /AdminGate/);
  assert.match(page, /IntelWorkspace/);
  assert.match(workspace, /não usa os handlers legados como cobertura/);
  assert.match(workspace, /Idempotency-Key/);
  assert.match(workspace, /registro interno autorizado/);
});
