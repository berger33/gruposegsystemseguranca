import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPLIANCE_TRANSITIONS, COMPLIANCE_BOUNDARY, COMPLIANCE_TYPES,
  OBLIGATION_LIST_FIELDS, DOCUMENT_LIST_FIELDS, TASK_LIST_FIELDS,
  deriveDocumentState, createExtComplianceApi,
} from "../src/server/ext-compliance-api.mjs";

const STAFF = "11111111-1111-4111-8111-111111111111";
const normalize = sql => String(sql).replace(/\s+/g, " ").trim();
function response() { return { status: 0, payload: null, writeHead(s) { this.status = s; }, end(v) { this.payload = JSON.parse(v); } }; }
function request(method = "GET", body, headers = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  return {
    method, url: "/api/ext/compliance/obligations",
    headers: { origin: "https://app.invalid", host: "app.invalid", "idempotency-key": "ext07-unit-key-0001", ...headers },
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}
// Pool falso com matchers ancorados em nomes de tabela; nada de match SQL amplo.
function fakePool({ failAudit = false } = {}) {
  const executed = [];
  const client = {
    async query(sql, params) {
      const text = normalize(sql);
      executed.push({ text, params });
      if (/^BEGIN$|^COMMIT$|^ROLLBACK$/.test(text)) return { rows: [] };
      if (/^SELECT \* FROM ext_compliance_events WHERE created_by_identity=\$1 AND idempotency_key=\$2 FOR UPDATE$/.test(text)) return { rows: [] };
      if (/^SELECT i\.id,i\.display_name,p\.role FROM auth_identities i/.test(text)) return { rows: [{ id: STAFF, display_name: "QA Staff", role: "ti" }] };
      if (/^INSERT INTO ext_compliance_obligations\b/.test(text)) return { rows: [{ id: "22222222-2222-4222-8222-222222222222", protocol: "OBR-EXT-20261003-ABCD", status: "sem_documento" }] };
      if (/^INSERT INTO ext_compliance_events\b/.test(text)) return { rows: [] };
      if (/^INSERT INTO audit_log\b/.test(text)) { if (failAudit) throw new Error("audit unavailable"); return { rows: [] }; }
      if (/FROM ext_compliance_obligations o\b/.test(text)) return { rows: [{ id: "22222222-2222-4222-8222-222222222222", protocol: "OBR-EXT-20261003-ABCD", status: "sem_documento", responsible_display_name: "QA Staff", open_task_count: 0, created_at: "2026-10-03T00:00:00.000Z" }] };
      return { rows: [] };
    },
    release() {},
  };
  return { executed, connect: async () => client, query: async (...args) => client.query(...args) };
}
const validObligation = {
  obligation_type: "licenca", title: "Licenca sintetica unitaria",
  description: "Obrigacao sintetica com descricao suficientemente longa.",
  legal_basis: "Norma interna sintetica", basis_source: "fonte sintetica declarada",
  scope_kind: "entidade", scope_reference: "Unidade sintetica",
  applicability_justification: "Justificativa sintetica declarada pela equipe interna.",
  periodicity: "anual", validity_rule_source: "regra sintetica declarada",
  renewal_window_days: 30, criticality: "alta", responsible_identity: STAFF,
};

test("EXT-07: máquinas de estado não saltam nem reabrem terminais", () => {
  assert.deepEqual(COMPLIANCE_TRANSITIONS.obligation.nao_aplicavel, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.obligation.encerrada, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.document.substituida, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.document.cancelada, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.task.concluida, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.task.cancelada, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.task.aberta, ["em_andamento", "cancelada"]);
  assert.ok(!COMPLIANCE_TRANSITIONS.document.vigente.includes("substituida"), "substituição exige passar por renovação");
});

test("EXT-07: fronteira não inventa ator externo, upload, bytes, download ou órgão público", () => {
  assert.equal(COMPLIANCE_BOUNDARY.journey, "staff_interno");
  for (const flag of ["external_actor", "public_route", "issuer_portal", "upload", "stored_bytes", "verified_storage", "checksum", "malware_scan", "download", "regulator_integration", "legal_opinion", "continuous_monitoring"]) {
    assert.equal(COMPLIANCE_BOUNDARY[flag], false, flag);
  }
  assert.match(COMPLIANCE_BOUNDARY.document, /não é arquivo recebido, verificado, armazenado ou baixável/);
  assert.match(COMPLIANCE_BOUNDARY.evaluation, /não existe scheduler canônico/);
  assert.deepEqual([...COMPLIANCE_TYPES], ["licenca", "certidao", "seguro", "alvara", "outro"]);
});

test("EXT-07: allowlists de listagem excluem metadado privado e auditoria", () => {
  const joined = [...OBLIGATION_LIST_FIELDS, ...DOCUMENT_LIST_FIELDS, ...TASK_LIST_FIELDS].join(" ");
  for (const forbidden of ["storage_key", "file_url", "file_name", "reference_value", "reference_source", "completion_result", "trigger_facts", "legal_basis", "applicability_justification", "closure_justification", "audit"]) {
    assert.doesNotMatch(joined, new RegExp(forbidden, "i"), forbidden);
  }
  assert.ok(DOCUMENT_LIST_FIELDS.includes("document_number_masked"));
  assert.ok(!DOCUMENT_LIST_FIELDS.includes("document_number"));
});

test("EXT-07: estado temporal deriva da data-base e da janela registrada, comparando datas ISO", () => {
  const base = "2026-10-03";
  assert.deepEqual(deriveDocumentState({ baseDate: base, expiryDate: "2027-06-01", noExpiry: false, renewalWindowDays: 30 }), { status: "vigente", days_remaining: 241, rule: null });
  assert.deepEqual(deriveDocumentState({ baseDate: base, expiryDate: "2026-10-13", noExpiry: false, renewalWindowDays: 30 }), { status: "a_vencer", days_remaining: 10, rule: "janela_renovacao" });
  assert.deepEqual(deriveDocumentState({ baseDate: base, expiryDate: "2026-10-03", noExpiry: false, renewalWindowDays: 30 }), { status: "vencida", days_remaining: 0, rule: "vencimento" });
  assert.deepEqual(deriveDocumentState({ baseDate: base, expiryDate: "2026-09-01", noExpiry: false, renewalWindowDays: 30 }), { status: "vencida", days_remaining: -32, rule: "vencimento" });
  // Ausência de vencimento é declarada e distinta de "sem risco medido".
  assert.deepEqual(deriveDocumentState({ baseDate: base, expiryDate: null, noExpiry: true, renewalWindowDays: 0 }), { status: "vigente", days_remaining: null, rule: null });
  // Janela zero só dispara no vencimento, nunca por limiar global oculto.
  assert.equal(deriveDocumentState({ baseDate: base, expiryDate: "2026-10-04", noExpiry: false, renewalWindowDays: 0 }).rule, null);
});

test("EXT-07: migração 153 endurece a 086 sem tabela paralela e sem seed", async () => {
  const sql = await readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
  for (const token of ["ext_compliance_obligations", "ext_compliance_tasks", "ext_compliance_events", "registro_legado", "jornada_canonica", "::text", "NOT VALID", "compliance historical record is immutable", "terminal compliance task is immutable", "derived from server base date", "ext_compliance_documents_current_per_obligation", "UNIQUE\\s*\\(document_id,\\s*period_end,\\s*trigger_rule\\)"]) {
    assert.match(sql, new RegExp(token, "i"), token);
  }
  assert.match(sql, /ALTER TABLE ext_compliance_documents/);
  assert.doesNotMatch(sql, /CREATE TABLE ext_compliance_documents\b/);
  assert.doesNotMatch(sql, /INSERT INTO ext_compliance_documents/i);
  assert.doesNotMatch(sql, /INSERT INTO auth_identities/i);
  assert.doesNotMatch(sql, /CREATE TABLE ext_compliance_documents_v2/i);
});

test("EXT-07: servidor liga o namespace canônico e aposenta o writer legado", async () => {
  const [server, advanced] = await Promise.all([
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/server/ext-advanced-api.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(server, /createExtComplianceApi/);
  assert.match(server, /\/api\/ext\/compliance\/obligations/);
  assert.match(server, /\/api\/ext\/compliance\/evaluate/);
  assert.match(server, /extComplianceApi\.handleLegacy/);
  assert.doesNotMatch(server, /extAdvancedApi\.handleComplianceDocuments/);
  assert.doesNotMatch(advanced, /INSERT INTO ext_compliance_documents/i);
  assert.doesNotMatch(advanced, /handleComplianceDocuments/);
  // EXT-08..12 preservados no módulo legado.
  for (const handler of ["handleKnowledgeBase", "handleExpansionPlans", "handleExpansionScenarios", "handleContinuityPlans", "handleAnalyticsExperiments", "handleVisualTokens", "handleVisualLayouts"]) {
    assert.match(advanced, new RegExp(handler), handler);
  }
});

test("EXT-07: UI staff real preserva chave após falha e declara fronteira documental", async () => {
  const source = await readFile(new URL("../src/app/admin/compliance/ComplianceWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /keys\.current\[op\]=k/);
  assert.match(source, /delete keys\.current\[op\]/);
  assert.match(source, /Chave preservada para retry seguro/);
  assert.match(source, /Vencimento gera tarefa e documento privado/);
  assert.match(source, /não armazena bytes/);
  assert.match(source, /pendência fail-closed/);
  assert.match(source, /Ausência de tarefa é distinta de zero/);
  assert.match(source, /não existe scheduler canônico|Não existe scheduler canônico/);
  assert.doesNotMatch(source, /storage_key|file_url/);
  // A UI órfã EXT-07..12 continua existindo e não foi removida sem decisão.
  const orphan = await readFile(new URL("../src/app/admin/ti/ExtAdvancedClient.tsx", import.meta.url), "utf8");
  assert.match(orphan, /EXT-07 Compliance/);
});

test("EXT-07: guardas distinguem 401 de 403 antes de tocar o banco", async () => {
  let queried = false;
  const pool = { query: async () => { queried = true; return { rows: [] }; }, connect: async () => { queried = true; throw new Error("nao deveria conectar"); } };
  const anonymous = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => null });
  let res = response();
  await anonymous.handleObligationList(request(), res);
  assert.equal(res.status, 401);
  assert.equal(queried, false);
  const denied = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => ({ identityId: STAFF, role: "rh" }) });
  res = response();
  await denied.handleObligationList(request(), res);
  assert.equal(res.status, 403);
  assert.equal(queried, false);
  res = response();
  await anonymous.handleLegacy(request("POST", {}), res);
  assert.equal(res.status, 401);
  res = response();
  await denied.handleLegacy(request("POST", {}), res);
  assert.equal(res.status, 403);
});

test("EXT-07: mutação exige same-origin, corpo objeto, tamanho e chave de idempotência", async () => {
  const pool = fakePool();
  const session = { identityId: STAFF, role: "ti" };
  const crossOrigin = createExtComplianceApi({ pool, sameOrigin: () => false, requireSession: async () => session });
  let res = response();
  await crossOrigin.handleObligationCreate(request("POST", validObligation), res);
  assert.equal(res.status, 403);
  const api = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => session });
  res = response();
  await api.handleObligationCreate(request("POST", "{nao-json"), res);
  assert.equal(res.status, 400);
  res = response();
  await api.handleObligationCreate(request("POST", ["nao", "objeto"]), res);
  assert.equal(res.status, 400);
  res = response();
  await api.handleObligationCreate(request("POST", { ...validObligation, title: "x".repeat(40000) }), res);
  assert.equal(res.status, 413);
  res = response();
  await api.handleObligationCreate(request("POST", validObligation, { "idempotency-key": "" }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "idempotency_key_required");
});

test("EXT-07: criação grava obrigação, evento e auditoria na mesma transação", async () => {
  const pool = fakePool();
  const api = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => ({ identityId: STAFF, role: "ti" }) });
  const res = response();
  await api.handleObligationCreate(request("POST", { ...validObligation, created_by_identity: "99999999-9999-4999-8999-999999999999", status: "vigente" }), res);
  assert.equal(res.status, 201);
  const texts = pool.executed.map(e => e.text);
  assert.equal(texts[0], "BEGIN");
  assert.equal(texts.at(-1), "COMMIT");
  const insert = pool.executed.find(e => /^INSERT INTO ext_compliance_obligations\b/.test(e.text));
  assert.ok(insert, "a obrigação é inserida na tabela canônica");
  assert.match(insert.text, /status é derivado|'sem_documento'/);
  // Autoria vem da sessão, nunca do corpo.
  assert.equal(insert.params.at(-1), STAFF);
  assert.ok(!insert.params.includes("99999999-9999-4999-8999-999999999999"));
  assert.ok(pool.executed.some(e => /^INSERT INTO ext_compliance_events\b/.test(e.text)));
  assert.ok(pool.executed.some(e => /^INSERT INTO audit_log\b/.test(e.text)));
  assert.ok(!texts.includes("ROLLBACK"));
});

test("EXT-07: falha de auditoria devolve 503 e desfaz obrigação, evento e tarefa", async () => {
  const pool = fakePool({ failAudit: true });
  const api = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => ({ identityId: STAFF, role: "ti" }) });
  const res = response();
  await api.handleObligationCreate(request("POST", validObligation), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_unavailable");
  const texts = pool.executed.map(e => e.text);
  assert.ok(texts.includes("ROLLBACK"));
  assert.ok(!texts.includes("COMMIT"));
});

test("EXT-07: responsável nominal não é aceito como identidade e UUID inválido é recusado", async () => {
  const pool = fakePool();
  const api = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => ({ identityId: STAFF, role: "ti" }) });
  for (const responsible of ["Nome Livre Sintetico", "", "nao-uuid", null]) {
    const res = response();
    await api.handleObligationCreate(request("POST", { ...validObligation, responsible_identity: responsible, responsible_name: "Nome Livre Sintetico" }), res);
    assert.equal(res.status, 400, String(responsible));
    assert.equal(res.payload.error, "invalid_responsible_identity");
  }
  // Nenhum INSERT foi tentado na tabela canônica recém-consultada.
  assert.equal(pool.executed.filter(e => /^INSERT INTO ext_compliance_obligations\b/.test(e.text)).length, 0);
});
