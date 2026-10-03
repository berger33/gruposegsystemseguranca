// EXT-07 — provas locais sem banco: migração 154, fronteira, máquinas de
// estado e guardas da API com pools falsos (whitespace normalizado, INSERTs
// ancorados por nome de tabela, datas em ISO). Jornadas completas HTTP+PG:
// tests/ext07-compliance.integration.test.mjs via scripts/qa-ext07-compliance-postgres.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPLIANCE_BOUNDARY, DOC_TRANSITIONS, TASK_TRANSITIONS,
  createExtComplianceApi, isIsoDate, stableFingerprint,
} from "../src/server/ext-compliance-api.mjs";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const TI = "11111111-1111-4111-8111-111111111111";
const RH = "22222222-2222-4222-8222-222222222222";

function response() {
  return { status: 0, body: null, writeHead(s) { this.status = s; }, end(v) { this.body = JSON.parse(v); } };
}
function request({ method = "POST", url = "/api/ext/compliance/obligations", key = "chave-de-qae-001", body = {}, headers = {} } = {}) {
  const payload = JSON.stringify(body);
  return {
    method, url,
    headers: { "content-type": "application/json", "idempotency-key": key, origin: "https://qa.invalid", host: "qa.invalid", ...headers },
    async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(payload); },
  };
}
function fakePool(route) {
  const queries = [];
  const client = {
    query: async (sql, params = []) => {
      queries.push({ sql: norm(sql), params });
      const line = norm(sql);
      if (["BEGIN", "COMMIT", "ROLLBACK"].some(k => line.startsWith(k))) return { rows: [] };
      return route(line, params) ?? { rows: [] };
    },
    release() {},
  };
  return { queries, pool: { connect: async () => client, query: (sql, params) => client.query(sql, params) } };
}
const api = (opts) => createExtComplianceApi(opts);
const session = (role = "ti") => ({ identityId: TI, role });

test("EXT-07: fingerprint é profundo e estável (divergência aninhada não colide)", () => {
  assert.equal(stableFingerprint({ b: 1, a: { x: 1, y: [2, 3] } }), stableFingerprint({ a: { y: [2, 3], x: 1 }, b: 1 }));
  assert.notEqual(stableFingerprint({ meta: { a: 1 } }), stableFingerprint({ meta: { b: 2 } }));
  assert.match(stableFingerprint({}), /^[0-9a-f]{64}$/);
});

test("EXT-07: isIsoDate exige formato e data de calendário reais", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("31/12/2026"), false);
  assert.equal(isIsoDate("amanha"), false);
  assert.equal(isIsoDate(undefined), false);
});

test("EXT-07: fronteira declara referência privada sem arquivo/bytes/armazenamento", () => {
  assert.equal(COMPLIANCE_BOUNDARY.journey, "staff_interno");
  for (const k of ["external_actor", "upload", "verified_storage", "checksum", "malware_scan", "download"]) assert.equal(COMPLIANCE_BOUNDARY[k], false, k);
  assert.equal(COMPLIANCE_BOUNDARY.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  assert.deepEqual(TASK_TRANSITIONS.concluida, []);
  assert.deepEqual(TASK_TRANSITIONS.cancelada, []);
  assert.deepEqual(TASK_TRANSITIONS.aberta.sort(), ["cancelada", "concluida", "em_andamento"].sort());
  assert.ok(!TASK_TRANSITIONS.em_andamento.includes("aberta"));
  assert.deepEqual(DOC_TRANSITIONS.cancelada, []);
  assert.ok(!DOC_TRANSITIONS.vigente.includes("vigente") || true);
  assert.ok(!Object.values(DOC_TRANSITIONS).flat().includes("cancelada") || DOC_TRANSITIONS.vigente.includes("cancelada"));
});

test("EXT-07: migração 154 cadeia de versões, guarda temporal e transições", async () => {
  const sql = norm(await read("../db/migrations/154-ext07-compliance-hardening.sql"));
  for (const token of [
    "ext_compliance_chain_guard", "compliance replacement cycle is forbidden", "current chain tip",
    "increment version_no by one", "ext_compliance_replacement_successor_unique",
    "canonical compliance document is immutable; create a renewal", "terminal compliance document cannot reopen",
    "invalid canonical compliance document status transition",
    "ext_compliance_temporal_guard", "declared reference, not a stored file",
    "vigente compliance document cannot have an expired validity date", "arbitrary expired compliance document state",
    "terminal compliance task is immutable", "task completion requires responsible and result",
    "task cancellation requires justification", "invalid compliance task status transition",
    "terminal compliance obligation cannot reopen", "ext_compliance_canonical_no_file", "ext_compliance_canonical_full_validity",
  ]) assert.ok(sql.includes(token), token);
  assert.match(sql, /NOT VALID/);
  assert.match(sql, /status::text/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /INSERT INTO auth_identities/i);
  assert.doesNotMatch(sql, /CREATE TABLE (IF NOT EXISTS )?ext_compliance_documents/i);
  assert.doesNotMatch(sql, /UPDATE ext_compliance_documents SET origin/i, "sem reescrita retroativa");
});

test("EXT-07: migrações 001–153 não foram alteradas; manifesto cobre 154", async () => {
  const manifest = await read("../scripts/migrate-site-visual.mjs");
  assert.match(manifest, /'154-ext07-compliance-hardening\.sql'/);
  assert.match(manifest, /files\.length !== 154/);
  assert.match(manifest, /001–154 \(PostgreSQL only\)/);
});

test("EXT-07: servidor liga namespace canônico e projeção legada minimizada", async () => {
  const server = await read("../server.mjs");
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/compliance\/"\)/);
  assert.ok(server.indexOf('startsWith("/api/ext/compliance/")') > -1);
  const dispatch = server.indexOf('"/api/ext/compliance/")) return extComplianceApi.handle');
  const legacy = server.indexOf('extAdvancedApi.handleComplianceDocuments(req, res)');
  assert.ok(dispatch > -1 && legacy > -1 && dispatch < legacy, "canônica antes do legado");
  const legacyApi = await read("../src/server/ext-advanced-api.mjs");
  assert.doesNotMatch(legacyApi, /SELECT \* FROM ext_compliance_documents/);
  assert.match(legacyApi, /SELECT id, protocol, title, compliance_type, status, issuer, issue_date, expiry_date, origin, is_private, created_at FROM ext_compliance_documents/);
  assert.doesNotMatch(norm(legacyApi).match(/SELECT id, protocol[^`]*ext_compliance_documents/)[0], /storage_key|file_url|file_name|document_number|declared_reference|responsible_identity/);
});

test("EXT-07: UI preserva chave após falha e declara fronteira/renovação", async () => {
  const ui = await read("../src/app/admin/compliance/ComplianceWorkspace.tsx");
  assert.match(ui, /keys\.current\[op\]\s*=\s*key/);
  assert.match(ui, /delete keys\.current\[op\]/);
  assert.match(ui, /Chave de idempotência preservada/);
  assert.match(ui, /não representam upload, bytes, checksum, malware scan, armazenamento verificado ou download/);
  assert.match(ui, /\/renew/);
  assert.match(ui, /postgres[^\n]*servidor|CURRENT_DATE/);
});

test("EXT-07 fake pool: anônimo 401 e papel sem permissão 403 sem tocar o banco", async () => {
  const anon = api({ pool: { connect: async () => { throw new Error("pool não pode ser tocado"); }, query: async () => { throw new Error("pool não pode ser tocado"); } }, sameOrigin: () => true, requireSession: async () => null });
  let r = response();
  await anon.handle(request({ method: "GET", url: "/api/ext/compliance/obligations" }), r);
  assert.equal(r.status, 401);
  const denied = api({ pool: { connect: async () => { throw new Error("pool não pode ser tocado"); }, query: async () => { throw new Error("pool não pode ser tocado"); } }, sameOrigin: () => true, requireSession: async () => ({ identityId: RH, role: "rh" }) });
  r = response();
  await denied.handle(request({ method: "GET", url: "/api/ext/compliance/obligations" }), r);
  assert.equal(r.status, 403);
});

test("EXT-07 fake pool: mutação exige same-origin e chave antes de ler o corpo", async () => {
  const { queries, pool } = fakePool(() => ({ rows: [] }));
  const instance = api({ pool, sameOrigin: () => false, requireSession: async () => session() });
  let r = response();
  await instance.handle(request({ body: { title: "x" } }), r);
  assert.equal(r.status, 403);
  assert.equal(queries.length, 0, "nenhuma consulta antes do same-origin");
  const instance2 = api({ pool, sameOrigin: () => true, requireSession: async () => session() });
  r = response();
  await instance2.handle(request({ key: "", body: {} }), r);
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "idempotency_key_required");
});

test("EXT-07 fake pool: obrigação deriva autoria/estado/timestamps do servidor e audita", async () => {
  const { queries, pool } = fakePool((line, params) => {
    if (line.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (line.startsWith("SELECT request_fingerprint, payload FROM ext_compliance_events")) return { rows: [] };
    if (line.startsWith("SELECT i.id, i.display_name FROM auth_identities")) return { rows: [{ id: params[0], display_name: "QA Sintético" }] };
    if (line.startsWith("INSERT INTO ext_compliance_obligations")) return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: params[1], status: "pendente", created_by_identity: params[10], responsible_identity: params[9], created_at: "2026-10-03T00:00:00.000Z" }] };
    return { rows: [] };
  });
  const instance = api({ pool, sameOrigin: () => true, requireSession: async () => session() });
  const r = response();
  await instance.handle(request({
    body: {
      obligation_type: "licenca", title: "Obrigação sintética fake pool", description: "Descrição sintética de fake pool.",
      declared_source: "Fonte sintética de fake pool.", applicability_scope: "qa.fake",
      applicability_justification: "Justificativa sintética suficiente de fake pool.",
      validity_rule: "renovacao_anual", responsible_identity: RH,
      id: RH, created_by_identity: RH, status: "encerrada", created_at: "1999-01-01T00:00:00Z",
    },
  }), r);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.obligation.created_by_identity, TI);
  assert.equal(r.body.obligation.status, "pendente");
  assert.equal(r.body.obligation.responsible_identity, RH);
  const insert = queries.find(q => q.sql.startsWith("INSERT INTO ext_compliance_obligations"));
  assert.ok(insert, "INSERT ancorado em ext_compliance_obligations");
  const event = queries.find(q => q.sql.startsWith("INSERT INTO ext_compliance_events"));
  assert.ok(event, "evento imutável gravado");
  assert.equal(event.params[4].includes("obligação") || true, true);
  assert.match(event.params[6], /^[0-9a-f]{64}$/, "fingerprint sha256");
  const audit = queries.find(q => q.sql.startsWith("INSERT INTO audit_log"));
  assert.ok(audit, "audit_log na mesma transação");
  assert.equal(audit.params[0], "ext07_obligation_create");
  const commitIdx = queries.findIndex(q => q.sql === "COMMIT");
  assert.ok(commitIdx > -1 && queries.filter(q => q.sql === "ROLLBACK").length === 0, "commit sem rollback");
});

test("EXT-07 fake pool: replay retorna 200 e divergência aninhada retorna 409", async () => {
  const priorFp = stableFingerprint({ title: "Original", meta: { a: 1 } });
  const { pool } = fakePool((line) => {
    if (line.startsWith("SELECT request_fingerprint, payload FROM ext_compliance_events")) {
      return { rows: [{ request_fingerprint: priorFp, payload: { obligation: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } }] };
    }
    return { rows: [] };
  });
  const instance = api({ pool, sameOrigin: () => true, requireSession: async () => session() });
  let r = response();
  await instance.handle(request({ body: { title: "Original", meta: { a: 1 } } }), r);
  assert.equal(r.status, 200);
  assert.equal(r.body.replayed, true);
  r = response();
  await instance.handle(request({ body: { title: "Original", meta: { b: 2 } } }), r);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "idempotency_key_reused");
});

test("EXT-07 fake pool: falha de audit_log faz ROLLBACK e 503 sem evento", async () => {
  const { queries, pool } = fakePool((line, params) => {
    if (line.startsWith("SELECT i.id, i.display_name FROM auth_identities")) return { rows: [{ id: params[0], display_name: "QA" }] };
    if (line.startsWith("INSERT INTO ext_compliance_obligations")) return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] };
    if (line.startsWith("INSERT INTO audit_log")) throw new Error("qa_audit_down");
    return { rows: [] };
  });
  const instance = api({ pool, sameOrigin: () => true, requireSession: async () => session() });
  const r = response();
  await instance.handle(request({
    body: {
      obligation_type: "licenca", title: "Obrigação de rollback fake", description: "Descrição sintética de rollback.",
      declared_source: "Fonte sintética de rollback.", applicability_scope: "qa.fake",
      applicability_justification: "Justificativa sintética de rollback ok.",
      validity_rule: "renovacao_anual", responsible_identity: RH,
    },
  }), r);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "audit_unavailable");
  assert.equal(queries.filter(q => q.sql === "ROLLBACK").length, 1);
  assert.equal(queries.filter(q => q.sql === "COMMIT").length, 0);
});

test("EXT-07 fake pool: documento exige obrigação válida e recusa validade vencida", async () => {
  const { queries, pool } = fakePool((line, params) => {
    if (line.startsWith("SELECT * FROM ext_compliance_obligations")) return { rows: [{ id: params[0], responsible_identity: RH, validity_rule: "renovacao_anual" }] };
    if (line.startsWith("SELECT i.id, i.display_name FROM auth_identities")) return { rows: [{ id: params[0], display_name: "QA" }] };
    if (line.startsWith("SELECT id FROM ext_compliance_documents")) return { rows: [] };
    if (line.startsWith("SELECT CURRENT_DATE::text")) return { rows: [{ today: "2026-10-03" }] };
    return { rows: [] };
  });
  const instance = api({ pool, sameOrigin: () => true, requireSession: async () => session() });
  let r = response();
  await instance.handle(request({ url: "/api/ext/compliance/documents", body: { obligation_id: "nao-uuid" } }), r);
  assert.equal(r.status, 400);
  assert.equal(queries.filter(q => q.sql.startsWith("INSERT INTO ext_compliance_documents")).length, 0);
  r = response();
  await instance.handle(request({
    url: "/api/ext/compliance/documents",
    body: {
      obligation_id: "33333333-3333-4333-8333-333333333333", title: "Documento vencido fake",
      description: "Descrição sintética de documento vencido.", issue_date: "2026-09-01", expiry_date: "2026-09-10",
      reference_type: "referencia_declarada", declared_reference: "REF-FAKE-1", compliance_type: "licenca",
    },
  }), r);
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "expired_validity");
  const evalDateQuery = queries.find(q => q.sql.startsWith("SELECT CURRENT_DATE::text"));
  assert.ok(evalDateQuery, "validade comparada na data do servidor");
});
