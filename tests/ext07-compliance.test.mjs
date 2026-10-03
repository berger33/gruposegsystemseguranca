import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COMPLIANCE_BOUNDARY, COMPLIANCE_TASK_TRANSITIONS, COMPLIANCE_DOCUMENT_TRANSITIONS, isIsoDate, createExtComplianceApi } from "../src/server/ext-compliance-api.mjs";

const mig153 = () => readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
const mig154 = () => readFile(new URL("../db/migrations/154-ext07-compliance-hardening.sql", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Migrações (estático)
// ---------------------------------------------------------------------------
test("EXT-07 153 usa ext_compliance_documents como fonte canônica e preserva legado", async () => {
  const s = await mig153();
  assert.match(s, /origin TEXT NOT NULL DEFAULT 'registro_legado'/);
  assert.match(s, /ext07_canonica/);
  assert.doesNotMatch(s, /CREATE TABLE ext_compliance_documents/);
  assert.doesNotMatch(s, /INSERT INTO auth_identities/i);
});
test("EXT-07 153 impõe documento privado, validade e tarefa idempotente", async () => {
  const s153 = await mig153();
  for (const token of ["is_private", "expiry_date", "ext_compliance_tasks", "UNIQUE(document_id,validity_period,rule)", "ext_compliance_events"]) {
    assert.match(s153, new RegExp(token.replaceAll("(", "\\(").replaceAll(")", "\\)"), "i"));
  }
});
test("EXT-07 154 é aditiva, sem seed, com máquina de estados e fronteira de referência", async () => {
  const s = await mig154();
  for (const token of [
    "ADD COLUMN IF NOT EXISTS superseded_by",
    "ADD COLUMN IF NOT EXISTS renewal_justification",
    "ext_compliance_current_version_unique",
    "ext_compliance_reference_only_check",
    "ext_compliance_validity_bound_check",
    "cannot be born expired",
    "client clock is not an authority",
    "invalid canonical compliance document transition",
    "terminal compliance task is immutable",
    "renewal must be paired",
    "::text",
    "NOT VALID",
  ]) assert.match(s, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(s, /INSERT INTO auth_identities|INSERT INTO ext_compliance/i);
});
test("EXT-07 154 reforça tarefa: transições, conclusão e responsável uma vez", async () => {
  const s = await mig154();
  assert.match(s, /task completion requires responsible and result/);
  assert.match(s, /task cancellation requires justification/);
  assert.match(s, /responsible is immutable once assigned/);
});

// ---------------------------------------------------------------------------
// Constantes e fronteiras do módulo
// ---------------------------------------------------------------------------
test("EXT-07 fronteira não inventa ator externo, upload, bytes ou rota pública", () => {
  assert.equal(COMPLIANCE_BOUNDARY.journey, "staff_interno");
  assert.equal(COMPLIANCE_BOUNDARY.document_source, "ext_compliance_documents");
  assert.equal(COMPLIANCE_BOUNDARY.task_source, "ext_compliance_tasks");
  for (const k of ["external_actor", "public_route", "upload", "stored_bytes", "checksum", "malware_scan", "verified_storage", "download"]) assert.equal(COMPLIANCE_BOUNDARY[k], false);
});
test("EXT-07 máquinas de estado não reabrem terminais", () => {
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.concluida, []);
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.cancelada, []);
  assert.deepEqual(COMPLIANCE_TASK_TRANSITIONS.aberta, ["em_andamento", "concluida", "cancelada"]);
  assert.deepEqual(COMPLIANCE_DOCUMENT_TRANSITIONS.em_renovacao, []);
  assert.deepEqual(COMPLIANCE_DOCUMENT_TRANSITIONS.cancelada, []);
  assert.ok(COMPLIANCE_DOCUMENT_TRANSITIONS.vigente.includes("vencida"));
});
test("EXT-07 validador de datas ISO é estrito", () => {
  for (const ok of ["2026-10-03", "2025-02-28", "2028-02-29"]) assert.equal(isIsoDate(ok), true, ok);
  for (const bad of ["2026-13-01", "2026-02-30", "2025-02-29", "abc", "2026-1-1", "10/03/2026", "", null, 20261003]) assert.equal(isIsoDate(bad), false, String(bad));
});

// ---------------------------------------------------------------------------
// Wiring do servidor e da UI (estático)
// ---------------------------------------------------------------------------
test("EXT-07 servidor despacha namespace canônico e preserva legado exato", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /createExtComplianceApi/);
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/compliance\/"\)/, "API_PATH_MATCH precisa despachar a rota canônica (regressão do 404)");
  assert.match(server, /url\.pathname\.startsWith\("\/api\/ext\/compliance\/"\)/);
  assert.match(server, /"\/api\/ext\/compliance-documents"/);
  assert.match(server, /legacy_writer_retired/);
});
test("EXT-07 UI declara fronteira documental e preserva chave no retry", async () => {
  const page = await readFile(new URL("../src/app/admin/compliance/page.tsx", import.meta.url), "utf8");
  assert.match(page, /robots/);
  assert.match(page, /index:\s*false/);
  const ui = await readFile(new URL("../src/app/admin/compliance/ComplianceWorkspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /keys\.current\[name\]\s*=\s*key/);
  assert.match(ui, /não representa upload/);
  assert.match(ui, /data do servidor/);
  assert.match(ui, /Renovação formal/);
});
test("EXT-07 workflow dedicado executa o gate PostgreSQL real", async () => {
  const wf = await readFile(new URL("../.github/workflows/ext07-delivery.yml", import.meta.url), "utf8");
  assert.match(wf, /test:ext07-compliance:pg/);
  assert.match(wf, /test:migrations:pg/);
});

// ---------------------------------------------------------------------------
// Fake pool: comportamento da API sem banco real.
// Convenções: whitespace normalizado, nomes de tabelas ancorados em INSERT,
// datas em ISO, pais recém-criados para negações.
// ---------------------------------------------------------------------------
const identityId = "11111111-1111-4111-8111-111111111111";
const otherIdentity = "22222222-2222-4222-8222-222222222222";
const obligationId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const norm = s => String(s).replace(/\s+/g, " ");

function res() { return { status: 0, payload: null, writeHead(s) { this.status = s; }, end(v) { this.payload = JSON.parse(v); } }; }
function req({ method = "GET", url = "/api/ext/compliance/obligations", body, key = "ext07-fake-key-0001", origin = "https://app.invalid" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "app.invalid", origin };
  if (key !== null) headers["idempotency-key"] = key;
  return { method, url, headers, async *[Symbol.asyncIterator]() { yield* bytes; } };
}
const session = { identityId, role: "ti" };
const apiFor = (pool, { sess = session, origin = true } = {}) => createExtComplianceApi({ pool, sameOrigin: () => origin, requireSession: async () => sess });

function fakePool({ obligation, priorEvents = [], auditFails = false } = {}) {
  const statements = [];
  const insertedEvents = [];
  const obligationRow = obligation === undefined ? {
    id: obligationId, obligation_type: "licenca", title: "Pai sintético recém-criado", status: "pendente",
    validity_rule: "validade anual sintética", responsible_identity: identityId, renewal_lead_days: 30,
  } : obligation;
  const client = {
    async query(sql, params = []) {
      const q = norm(sql);
      statements.push({ sql: q, params });
      if (q === "BEGIN" || q === "COMMIT" || q === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (q.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (q.includes("FROM auth_identities i WHERE i.id = $1 AND i.kind = 'staff'")) return { rows: [{ id: params[0] }] };
      if (q.includes("SELECT payload, request_fingerprint FROM ext_compliance_events WHERE created_by_identity=$1")) return { rows: [...priorEvents] };
      if (q.includes("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE")) return { rows: obligationRow ? [{ ...obligationRow }] : [] };
      if (q.includes("SELECT display_name FROM auth_identities WHERE id=$1")) return { rows: [{ display_name: "Staff Sintético" }] };
      if (q.includes("SELECT CURRENT_DATE::text AS today")) return { rows: [{ today: "2026-10-03" }] };
      if (q.includes("INSERT INTO ext_compliance_obligations(")) {
        return { rows: [{ id: obligationId, obligation_type: params[0], title: params[1], status: "pendente", responsible_identity: params[9], created_by_identity: params[10], created_at: "2026-10-03T00:00:00.000Z" }] };
      }
      if (q.includes("INSERT INTO ext_compliance_documents(")) {
        return { rows: [{ id: documentId, protocol: params[0], title: params[1], status: "vigente", obligation_id: params[params.length - 1], origin: "ext07_canonica", issue_date: "2026-01-10", effective_start_date: "2026-01-10", expiry_date: "2027-01-10", reference_type: "referencia_declarada", version_no: 1, is_private: true }] };
      }
      if (q.includes("FROM ext_compliance_documents d JOIN ext_compliance_obligations o")) return { rows: [] };
      if (q.includes("count(*)::int AS n FROM ext_compliance_documents WHERE origin='ext07_canonica'")) return { rows: [{ n: 0 }] };
      if (q.includes("INSERT INTO ext_compliance_events(")) { insertedEvents.push(params); return { rows: [], rowCount: 1 }; }
      if (q.includes("INSERT INTO audit_log(")) { if (auditFails) throw new Error("audit fail"); return { rows: [], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, insertedEvents, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

test("EXT-07 fake: anônimo 401 e rh 403 sem tocar o banco", async () => {
  let p = fakePool();
  let r = res();
  await apiFor(p.pool, { sess: null }).handleObligationList(req(), r);
  assert.equal(r.status, 401);
  assert.equal(p.statements.length, 0);
  p = fakePool();
  r = res();
  await apiFor(p.pool, { sess: { identityId, role: "rh" } }).handleObligationList(req(), r);
  assert.equal(r.status, 403);
  assert.equal(p.statements.length, 0);
});
test("EXT-07 fake: mutação sem same-origin 403 e sem chave 400, antes do banco", async () => {
  const p = fakePool();
  let r = res();
  await apiFor(p.pool, { origin: false }).handleCreateObligation(req({ method: "POST", body: { title: "x" } }), r);
  assert.equal(r.status, 403);
  assert.equal(p.statements.length, 0);
  r = res();
  await apiFor(p.pool).handleCreateObligation(req({ method: "POST", key: null, body: { title: "x" } }), r);
  assert.equal(r.status, 400);
  assert.equal(p.statements.length, 0);
});
test("EXT-07 fake: obrigação ancora INSERT na tabela e deriva autoria da sessão", async () => {
  const p = fakePool();
  const r = res();
  const body = {
    obligation_type: "alvara", title: "Obrigação fake criada agora", description: "Descrição sintética detalhada.",
    declared_source: "Fonte sintética declarada.", applicability_scope: "escopo sint", applicability_justification: "Justificativa sintética.",
    validity_rule: "regra sintética anual", responsible_identity: otherIdentity,
    id: "55555555-5555-4555-8555-555555555555", created_by_identity: otherIdentity, status: "encerrada",
  };
  await apiFor(p.pool).handleCreateObligation(req({ method: "POST", body }), r);
  assert.equal(r.status, 201, JSON.stringify(r.payload));
  assert.equal(r.payload.obligation.created_by_identity, identityId);
  const insert = p.statements.find(s => s.sql.includes("INSERT INTO ext_compliance_obligations("));
  assert.ok(insert, "INSERT ancorado em ext_compliance_obligations");
  assert.equal(insert.params[10], identityId);
  assert.equal(insert.params[9], otherIdentity);
  assert.ok(!insert.params.includes("55555555-5555-4555-8555-555555555555"));
  const event = p.insertedEvents[0];
  assert.equal(event[3], "obligation_created");
});
test("EXT-07 fake: responsável inexistente recusa documento com pai recém-criado", async () => {
  const p = fakePool({ obligation: null });
  const r = res();
  await apiFor(p.pool).handleCreateDocument(req({ method: "POST", body: { obligation_id: obligationId, title: "Documento sintético", description: "Descrição sintética detalhada.", issue_date: "2026-01-01", expiry_date: "2027-01-01", reference_type: "referencia_declarada", declared_reference: "ref sintética" } }), r);
  assert.equal(r.status, 404);
  assert.ok(!p.statements.some(s => s.sql.includes("INSERT INTO ext_compliance_documents(")));
});
test("EXT-07 fake: documento só aceita datas ISO reais e validade coerente", async () => {
  const p = fakePool();
  for (const over of [{ issue_date: "10/01/2026" }, { issue_date: "2026-02-30" }, { expiry_date: "2025-12-31" }]) {
    const r = res();
    await apiFor(p.pool).handleCreateDocument(req({ method: "POST", body: { obligation_id: obligationId, title: "Documento sintético", description: "Descrição sintética detalhada.", issue_date: "2026-01-10", expiry_date: "2027-01-10", reference_type: "referencia_declarada", declared_reference: "ref sintética", ...over } }), r);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(r.payload.error, "invalid_validity");
  }
  assert.ok(!p.statements.some(s => s.sql.includes("INSERT INTO ext_compliance_documents(")));
});
test("EXT-07 fake: avaliação usa CURRENT_DATE do servidor, nunca data do corpo", async () => {
  const p = fakePool();
  const r = res();
  await apiFor(p.pool).handleEvaluate(req({ method: "POST", url: "/api/ext/compliance/evaluate", body: { evaluation_date: "1999-01-01" } }), r);
  assert.equal(r.status, 200);
  assert.equal(r.payload.evaluation_date, "2026-10-03");
  assert.equal(r.payload.source, "postgresql_current_date");
  const select = p.statements.find(s => s.sql.includes("expiry_date <= CURRENT_DATE"));
  assert.ok(select, "seleção temporal deve filtrar por CURRENT_DATE no servidor");
  assert.ok(!select.params.some(x => x === "1999-01-01"), "data do cliente não pode entrar como parâmetro");
});
test("EXT-07 fake: falha de audit_log faz ROLLBACK depois do INSERT de auditoria", async () => {
  const p = fakePool({ auditFails: true });
  const r = res();
  const body = {
    obligation_type: "alvara", title: "Obrigação rollback sintética", description: "Descrição sintética detalhada.",
    declared_source: "Fonte sintética declarada.", applicability_scope: "escopo sint", applicability_justification: "Justificativa sintética.",
    validity_rule: "regra sintética anual", responsible_identity: otherIdentity,
  };
  await apiFor(p.pool).handleCreateObligation(req({ method: "POST", body }), r);
  assert.equal(r.status, 503);
  assert.equal(r.payload.error, "audit_unavailable");
  const auditIdx = p.statements.findIndex(s => s.sql.includes("INSERT INTO audit_log("));
  const rollbackIdx = p.statements.findIndex(s => s.sql === "ROLLBACK");
  assert.ok(auditIdx > -1 && rollbackIdx > auditIdx, "ROLLBACK deve seguir a falha de auditoria");
});
test("EXT-07 fake: replay da chave devolve payload sem nova escrita", async () => {
  const body = { obligation_type: "alvara", title: "Obrigação replay sintética", description: "Descrição sintética detalhada.", declared_source: "Fonte sintética declarada.", applicability_scope: "escopo sint", applicability_justification: "Justificativa sintética.", validity_rule: "regra sintética anual", responsible_identity: otherIdentity };
  const first = fakePool();
  const r1 = res();
  await apiFor(first.pool).handleCreateObligation(req({ method: "POST", body }), r1);
  assert.equal(r1.status, 201);
  const storedFp = first.insertedEvents[0][6];
  const second = fakePool({ priorEvents: [{ payload: { obligation: r1.payload.obligation }, request_fingerprint: storedFp }] });
  const r2 = res();
  await apiFor(second.pool).handleCreateObligation(req({ method: "POST", body }), r2);
  assert.equal(r2.status, 200);
  assert.equal(r2.payload.replayed, true);
  assert.ok(!second.statements.some(s => s.sql.includes("INSERT INTO ext_compliance_obligations(")));
  const third = fakePool({ priorEvents: [{ payload: {}, request_fingerprint: "0".repeat(64) }] });
  const r3 = res();
  await apiFor(third.pool).handleCreateObligation(req({ method: "POST", body }), r3);
  assert.equal(r3.status, 409);
});
