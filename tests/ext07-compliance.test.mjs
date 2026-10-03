// EXT-07 — teste focal sem banco: contratos estáticos, allowlist, máquina de estados,
// regra temporal e fronteiras declaradas. Fake pools normalizam whitespace e ancoram
// nomes de tabela em INSERT; datas são comparadas como ISO.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  COMPLIANCE_LIST_FIELDS, COMPLIANCE_TRANSITIONS, COMPLIANCE_TYPES, REFERENCE_KINDS,
  createExtComplianceApi, deriveTemporalState,
} from "../src/server/ext-compliance-api.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const norm = sql => String(sql).replace(/\s+/g, " ").trim();
const insertsInto = (sql, table) => new RegExp(`INSERT INTO ${table}\\b`, "i").test(norm(sql));

function res() {return {status: 0, payload: null, writeHead(s) {this.status = s;}, end(v) {this.payload = JSON.parse(v);}};}
function req(method = "GET", body) {
  const bytes = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {method, url: "/api/ext/compliance/obligations", headers: {origin: "https://app.invalid", host: "app.invalid", "idempotency-key": "ext07-focal-key-0001"}, async *[Symbol.asyncIterator]() {yield* bytes;}};
}
const idlePool = {query: async () => ({rows: []})};

test("EXT-07 migração 153 endurece a 086 sem criar tabela paralela de documento", async () => {
  const sql = await readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
  assert.match(sql, /ALTER TABLE ext_compliance_documents/);
  assert.match(sql, /registro_legado/);
  assert.doesNotMatch(sql, /CREATE TABLE (IF NOT EXISTS )?ext_compliance_documents_v2/i);
  // Nenhuma tabela paralela equivalente de documento de compliance.
  const created = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]).sort();
  assert.deepEqual(created, ["ext_compliance_events", "ext_compliance_obligations", "ext_compliance_tasks"]);
});

test("EXT-07 153 impõe privacidade, validade e tarefa única por documento/período/regra", async () => {
  const sql = await readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
  assert.match(sql, /is_private = true/);
  assert.match(sql, /ext_compliance_tasks_unique_per_expiry/);
  assert.match(norm(sql), /ON ext_compliance_tasks\(document_id, ?validity_period_end, ?trigger_rule_key\)/);
  assert.match(sql, /ext_compliance_documents_current_unique/);
  assert.match(sql, /ext_compliance_documents_temporal_state/);
  // Enum PostgreSQL comparado via ::text.
  assert.match(sql, /status::text/);
  // Constraints sobre tabela histórica são NOT VALID.
  assert.match(sql, /ext_compliance_documents_canonical_shape[\s\S]*?NOT VALID/);
  // Sem seed.
  assert.doesNotMatch(norm(sql), /INSERT INTO ext_compliance_(obligations|documents|tasks)\b/i);
});

test("EXT-07 banco torna evento, documento, tarefa e obrigação resistentes a sobrescrita", async () => {
  const sql = await readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
  for (const token of [
    "compliance historical record is immutable",
    "canonical compliance document fields are immutable",
    "terminal compliance document state cannot reopen silently",
    "superseded compliance version cannot become current again",
    "canonical compliance task fields are immutable",
    "terminal compliance task is immutable",
    "canonical compliance obligation configuration is immutable",
    "terminal compliance obligation cannot reopen silently",
  ]) assert.match(sql, new RegExp(token, "i"));
});

test("EXT-07 máquinas de estado não reabrem terminais", () => {
  assert.deepEqual(COMPLIANCE_TRANSITIONS.task.concluida, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.task.cancelada, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.document.substituida, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.document.cancelada, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.obligation.encerrada, []);
  assert.deepEqual(COMPLIANCE_TRANSITIONS.obligation.nao_aplicavel, []);
});

test("EXT-07 regra temporal deriva da data-base e distingue ausência de vencimento", () => {
  const w = 30;
  assert.deepEqual(deriveTemporalState({baseDate: "2026-01-01", expiryDate: "2026-06-01", hasExpiry: true, renewalWindowDays: w}).state, "vigente");
  const near = deriveTemporalState({baseDate: "2026-05-20", expiryDate: "2026-06-01", hasExpiry: true, renewalWindowDays: w});
  assert.equal(near.state, "a_vencer");
  assert.equal(near.task_required, true);
  assert.equal(near.alert_from, "2026-05-02");
  const late = deriveTemporalState({baseDate: "2026-07-01", expiryDate: "2026-06-01", hasExpiry: true, renewalWindowDays: w});
  assert.equal(late.state, "vencida");
  assert.equal(late.task_required, true);
  // Ausência de vencimento é declarada explicitamente e NÃO gera tarefa nem vira "sem risco".
  const none = deriveTemporalState({baseDate: "2026-07-01", expiryDate: null, hasExpiry: false, renewalWindowDays: w});
  assert.equal(none.state, "vigente");
  assert.equal(none.task_required, false);
  assert.equal(none.absence, "sem_vencimento_declarado");
  // Limite exato da janela e do vencimento.
  assert.equal(deriveTemporalState({baseDate: "2026-05-02", expiryDate: "2026-06-01", hasExpiry: true, renewalWindowDays: w}).state, "a_vencer");
  assert.equal(deriveTemporalState({baseDate: "2026-05-01", expiryDate: "2026-06-01", hasExpiry: true, renewalWindowDays: w}).state, "vigente");
  assert.equal(deriveTemporalState({baseDate: "2026-06-01", expiryDate: "2026-06-01", hasExpiry: true, renewalWindowDays: 0}).state, "a_vencer");
});

test("EXT-07 allowlist de listagem exclui arquivo, storage, número e notas", () => {
  const joined = COMPLIANCE_LIST_FIELDS.join(" ");
  for (const forbidden of ["file_url", "file_name", "storage_key", "document_number", "reference_declared", "reference_note", "audit", "identity_id", "trigger_facts"]) {
    assert.doesNotMatch(joined, new RegExp(forbidden, "i"));
  }
  assert.ok(COMPLIANCE_LIST_FIELDS.includes("temporal_state"));
});

test("EXT-07 staff distingue 401 de 403 antes de tocar o banco", async () => {
  let queried = false;
  const spy = {query: async () => {queried = true; return {rows: []};}};
  let r = res();
  await createExtComplianceApi({pool: spy, sameOrigin: () => true, requireSession: async () => null}).handleObligationList(req(), r);
  assert.equal(r.status, 401);
  assert.equal(queried, false);
  r = res();
  await createExtComplianceApi({pool: spy, sameOrigin: () => true, requireSession: async () => ({identityId: id, role: "rh"})}).handleObligationList(req(), r);
  assert.equal(r.status, 403);
  assert.equal(queried, false);
});

test("EXT-07 mutação exige same-origin e chave de idempotência", async () => {
  const api = createExtComplianceApi({pool: idlePool, sameOrigin: () => false, requireSession: async () => ({identityId: id, role: "ti"})});
  const r = res();
  await api.handleObligationCreate(req("POST", {}), r);
  assert.equal(r.status, 403);
  const api2 = createExtComplianceApi({pool: idlePool, sameOrigin: () => true, requireSession: async () => ({identityId: id, role: "ti"})});
  const r2 = res(), bad = req("POST", {});
  bad.headers["idempotency-key"] = "";
  await api2.handleObligationCreate(bad, r2);
  assert.equal(r2.status, 400);
  assert.equal(r2.payload.error, "idempotency_key_required");
});

test("EXT-07 nunca aceita responsável nominal nem autoria pelo corpo", async () => {
  const statements = [];
  const client = {
    query: async sql => {
      const text = norm(sql);
      statements.push(text);
      // Ledger de idempotência vazio: a mutação precisa seguir para a escrita de negócio.
      if (/SELECT \* FROM ext_compliance_events\b/i.test(text)) return {rows: []};
      return {rows: [{id, d: "2026-01-01", protocol: "OBR-EXT-20260101-AAAA", renewal_window_days: 30, status: "ativa"}]};
    },
    release() {},
  };
  const api = createExtComplianceApi({pool: {connect: async () => client, query: client.query}, sameOrigin: () => true, requireSession: async () => ({identityId: id, role: "ti"})});
  const r = res();
  await api.handleObligationCreate(req("POST", {
    obligation_type: "licenca", title: "Licenca sintetica", description: "Descricao sintetica longa o suficiente.",
    legal_basis: "Politica interna sintetica", basis_kind: "declarada_interna", scope_kind: "entidade",
    scope_label: "Entidade sintetica", applicability_justification: "Justificativa sintetica suficientemente longa.",
    periodicity: "anual", renewal_window_days: 30, responsible_identity_id: id,
    // Campos forjados que devem ser ignorados.
    responsible_name: "Nome Forjado", created_by_identity: "22222222-2222-4222-8222-222222222222",
    status: "encerrada", protocol: "OBR-EXT-19990101-ZZZZ", created_at: "1999-01-01",
  }), r);
  const insert = statements.find(x => insertsInto(x, "ext_compliance_obligations"));
  assert.ok(insert, "a criação deve inserir em ext_compliance_obligations");
  for (const forbidden of ["responsible_name", "closed_at", "closed_by_identity"]) {
    assert.doesNotMatch(insert.slice(0, insert.indexOf("VALUES")), new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(insert, /created_by_identity/);
});

test("EXT-07 remove a autoridade de escrita do módulo legado e preserva EXT-08..12", async () => {
  const legacy = await readFile(new URL("../src/server/ext-advanced-api.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(norm(legacy), /INSERT INTO ext_compliance_documents\b/i);
  assert.doesNotMatch(norm(legacy), /UPDATE ext_compliance_documents\b/i);
  assert.doesNotMatch(legacy, /handleComplianceDocuments/);
  for (const keep of ["handleKnowledgeBase", "handleExpansionPlans", "handleExpansionScenarios", "handleContinuityPlans", "handleAnalyticsExperiments", "handleVisualTokens", "handleVisualLayouts"]) {
    assert.match(legacy, new RegExp(keep));
  }
});

test("EXT-07 server.mjs liga rotas canônicas e mantém as rotas exatas legadas", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /createExtComplianceApi/);
  assert.match(server, /\/api\/ext\/compliance\/obligations/);
  assert.match(server, /\/api\/ext\/compliance\/evaluate/);
  assert.match(server, /handleTaskComplete/);
  for (const legacy of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents", "/api/ext/compliance-documents"]) {
    assert.ok(server.includes(legacy), `rota legada preservada: ${legacy}`);
  }
  assert.match(server, /extComplianceApi\.handleLegacy/);
  // Não existe rota pública nem de cliente para compliance.
  assert.doesNotMatch(server, /\/api\/client\/compliance/);
  assert.doesNotMatch(server, /\/api\/public\/compliance/);
});

test("EXT-07 UI staff real declara fronteiras e preserva a chave no retry", async () => {
  const ui = await readFile(new URL("../src/app/admin/compliance/ComplianceWorkspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /keys\.current\[op\]=key/);
  assert.match(ui, /Vencimento gera tarefa e documento privado/);
  assert.match(ui, /referência documental privada declarada/i);
  assert.match(ui, /Não há upload, bytes recebidos, checksum, varredura de malware, armazenamento verificado nem download/);
  assert.match(ui, /fail-closed/);
  assert.match(ui, /ausência: \{aggregate\.absence\} \(distinta de zero\)/);
  // A tela declara a ausência de download/checksum, mas nunca os OFERECE.
  assert.doesNotMatch(ui, /Baixar|href=|<a /i);
  // storage_key/file_url só aparecem como texto explicativo, nunca como dado renderizado.
  assert.doesNotMatch(ui, /\{[^}]*\b(storage_key|file_url|file_name)\b[^}]*\}/);
  // Nenhum afordance de ator externo: só rotas staff /api/ext/compliance/*.
  assert.doesNotMatch(ui, /\/api\/public|\/api\/client|\/cliente\/|token=/i);
  for (const url of [...ui.matchAll(/fetch\(`?"?(\/[^"`,)]+)/g)].map(m => m[1])) {
    assert.ok(url.startsWith("/api/ext/compliance/"), `a tela só chama a API staff canônica: ${url}`);
  }
  // E declara explicitamente a ausência do ator externo.
  assert.match(ui, /Não há portal de órgão emissor/);
  const page = await readFile(new URL("../src/app/admin/compliance/page.tsx", import.meta.url), "utf8");
  assert.match(page, /ComplianceWorkspace/);
});

test("EXT-07 preserva ExtAdvancedClient.tsx e os tipos/kinds declarados", async () => {
  const orphan = await readFile(new URL("../src/app/admin/ti/ExtAdvancedClient.tsx", import.meta.url), "utf8");
  assert.ok(orphan.length > 0, "a UI órfã não é removida sem decisão do proprietário");
  assert.deepEqual([...COMPLIANCE_TYPES], ["licenca", "certidao", "seguro", "alvara", "outro"]);
  assert.ok(REFERENCE_KINDS.includes("referencia_declarada"));
});
