import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPLIANCE_DOCUMENT_BOUNDARY,
  COMPLIANCE_LIST_FIELDS,
  COMPLIANCE_TASK_TRANSITIONS,
  createExtComplianceApi,
} from "../src/server/ext-compliance-api.mjs";

const identity = "11111111-1111-4111-8111-111111111111";
const source = path => readFile(new URL(path, import.meta.url), "utf8");
const normalized = value => value.replace(/\s+/g, " ").trim();
function response() { return { status: 0, body: null, writeHead(status) { this.status = status; }, end(value) { this.body = JSON.parse(value); } }; }
function request(url, { method = "GET", body, origin = "https://app.invalid" } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  return { method, url, headers: { host: "app.invalid", origin, "idempotency-key": "ext07-unit-key" }, async *[Symbol.asyncIterator]() { yield* chunks; } };
}
const neverPool = { query: async () => { throw new Error("unexpected query"); }, connect: async () => { throw new Error("unexpected connection"); } };

async function invoke({ session = null, sameOrigin = true, url = "/api/ext/compliance/obligations", method = "GET", body } = {}) {
  const res = response();
  const api = createExtComplianceApi({ pool: neverPool, sameOrigin: () => sameOrigin, requireSession: async () => session });
  await api.handle(request(url, { method, body }), res);
  return res;
}

test("EXT-07 mantém ext_compliance_documents e ext_compliance_tasks como fontes", async () => {
  const sql = normalized(await source("../db/migrations/154-ext07-compliance-hardening.sql"));
  assert.doesNotMatch(sql, /CREATE TABLE (?:IF NOT EXISTS )?ext_compliance_documents/i);
  assert.doesNotMatch(sql, /CREATE TABLE (?:IF NOT EXISTS )?ext_compliance_tasks/i);
  assert.match(sql, /ALTER TABLE ext_compliance_documents/);
  assert.match(sql, /ALTER TABLE ext_compliance_tasks/);
});

test("EXT-07 154 reforça privacidade sem alegar arquivo", async () => {
  const sql = await source("../db/migrations/154-ext07-compliance-hardening.sql");
  assert.match(sql, /ext_compliance_canonical_private_v154/);
  assert.match(sql, /ext_compliance_canonical_no_file_claim_v154/);
  assert.equal(COMPLIANCE_DOCUMENT_BOUNDARY.file, false);
  assert.equal(COMPLIANCE_DOCUMENT_BOUNDARY.verified_storage, false);
  assert.equal(COMPLIANCE_DOCUMENT_BOUNDARY.download, false);
});

test("EXT-07 listagem usa allowlist sem metadados privados", () => {
  const fields = COMPLIANCE_LIST_FIELDS.join(" ");
  for (const forbidden of ["storage_key", "file_url", "document_number", "declared_reference", "reference_source"]) assert.doesNotMatch(fields, new RegExp(forbidden, "i"));
  for (const required of ["id", "protocol", "expiry_date", "is_private", "version_no"]) assert.match(fields, new RegExp(`(?:^| )${required}(?: |$)`));
});

test("EXT-07 máquina de tarefa não reabre terminais", () => {
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.concluida, []);
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.cancelada, []);
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.aberta, ["em_andamento", "cancelada"]);
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.em_andamento, ["concluida", "cancelada"]);
});

test("EXT-07 154 implementa renovação formal e trava ciclo/versão atual", async () => {
  const sql = normalized(await source("../db/migrations/154-ext07-compliance-hardening.sql"));
  for (const token of ["replacement_of", "superseded_by", "renewal_justification", "renewed_by_identity", "is_current", "compliance renewal cycle is forbidden"]) assert.match(sql, new RegExp(token, "i"));
  assert.match(sql, /CREATE UNIQUE INDEX ext_compliance_current_version_unique/);
});

test("EXT-07 154 deriva validade do servidor e impede sobrescrita", async () => {
  const sql = normalized(await source("../db/migrations/154-ext07-compliance-hardening.sql"));
  assert.match(sql, /CURRENT_DATE/);
  assert.match(sql, /compliance state must be derived from server date/);
  assert.match(sql, /validity\/history is immutable; create a renewal/);
  assert.match(sql, /expiry_date >= effective_start_date/);
});

test("EXT-07 154 exige responsável e fatos na tarefa", async () => {
  const sql = normalized(await source("../db/migrations/154-ext07-compliance-hardening.sql"));
  assert.match(sql, /ext_compliance_tasks_responsible_v154/);
  assert.match(sql, /facts \? 'source'/);
  assert.match(sql, /facts \? 'date_base'/);
  assert.match(sql, /task completion requires started state, responsible and result/);
});

test("EXT-07 evento e audit_log pertencem à mesma mutação", async () => {
  const api = normalized(await source("../src/server/ext-compliance-api.mjs"));
  assert.match(api, /INSERT INTO ext_compliance_events\s*\(/i);
  assert.match(api, /INSERT INTO audit_log\s*\(/i);
  assert.match(api, /audit_unavailable/);
  assert.match(api, /ROLLBACK/);
});

test("EXT-07 ancora INSERTs nas tabelas canônicas", async () => {
  const api = normalized(await source("../src/server/ext-compliance-api.mjs"));
  assert.match(api, /INSERT INTO ext_compliance_obligations\s*\(/i);
  assert.match(api, /INSERT INTO ext_compliance_documents\s*\(/i);
  assert.match(api, /INSERT INTO ext_compliance_tasks\s*\(/i);
  assert.match(api, /INSERT INTO ext_compliance_events\s*\(/i);
  assert.doesNotMatch(api, /INSERT INTO [^ ]*compliance[^ (]*\s+VALUES/i);
});

test("EXT-07 distingue 401 de 403 antes do banco", async () => {
  assert.equal((await invoke()).status, 401);
  assert.equal((await invoke({ session: { identityId: identity, role: "rh" } })).status, 403);
});

test("EXT-07 aplica same-origin apenas à mutação", async () => {
  const denied = await invoke({ session: { identityId: identity, role: "ti" }, sameOrigin: false, method: "POST", body: {} });
  assert.equal(denied.status, 403);
  // A leitura chegou além do guard (e portanto ao fake pool) mesmo sem Origin;
  // o handler converte a indisponibilidade sintética em 503.
  assert.equal((await invoke({ session: { identityId: identity, role: "ti" }, sameOrigin: false })).status, 503);
});

test("EXT-07 UUID inválido é 400 sem consulta ampla", async () => {
  const res = await invoke({ session: { identityId: identity, role: "ti" }, url: "/api/ext/compliance/documents/not-a-uuid" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_document_id");
});

test("EXT-07 legado autentica e autoriza antes do 410", async () => {
  const apiFor = session => createExtComplianceApi({ pool: neverPool, sameOrigin: () => true, requireSession: async () => session });
  let res = response(); await apiFor(null).handleLegacy(request("/api/ext/compliance-documents", { method: "POST", body: {} }), res); assert.equal(res.status, 401);
  res = response(); await apiFor({ identityId: identity, role: "rh" }).handleLegacy(request("/api/ext/compliance-documents", { method: "POST", body: {} }), res); assert.equal(res.status, 403);
  res = response(); await apiFor({ identityId: identity, role: "ti" }).handleLegacy(request("/api/ext/compliance-documents", { method: "POST", body: {} }), res); assert.equal(res.status, 410);
});

test("EXT-07 servidor publica matcher canônico e preserva EXT-08..12", async () => {
  const [server, advanced] = await Promise.all([source("../server.mjs"), source("../src/server/ext-advanced-api.mjs")]);
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/compliance\/"\)/);
  for (const handler of ["handleKnowledgeBase", "handleExpansionPlans", "handleContinuityPlans", "handleAnalyticsExperiments", "handleVisualTokens"]) assert.match(advanced, new RegExp(handler));
});
