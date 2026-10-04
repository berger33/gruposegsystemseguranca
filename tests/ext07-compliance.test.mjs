// EXT-07 — teste focal estático: contrato das migrações 153/154, da API
// canônica e das fronteiras declaradas. Não prova jornada HTTP: isso é
// responsabilidade de `npm run test:ext07-compliance:pg`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const journey = () => read("db/migrations/153-ext07-compliance-journey.sql");
const hardening = () => read("db/migrations/154-ext07-compliance-hardening.sql");
const api = () => read("src/server/ext-compliance-api.mjs");

test("EXT-07 usa ext_compliance_documents como fonte canônica e preserva legado", async () => {
  const sql = await journey();
  assert.match(sql, /origin TEXT NOT NULL DEFAULT 'registro_legado'/);
  assert.match(sql, /ext07_canonica/);
  assert.doesNotMatch(sql, /CREATE TABLE ext_compliance_documents/);
});

test("EXT-07 impõe documento privado, validade e tarefa idempotente", async () => {
  const sql = await journey();
  for (const token of ["is_private", "expiry_date", "ext_compliance_tasks", "UNIQUE(document_id,validity_period,rule)", "ext_compliance_events"]) {
    assert.match(sql, new RegExp(token.replaceAll("(", "\\(").replaceAll(")", "\\)"), "i"));
  }
});

test("EXT-07 histórico é imutável e conclusão exige responsável/resultado", async () => {
  const sql = await journey();
  assert.match(sql, /compliance historical record is immutable/);
  assert.match(sql, /task completion requires responsible and result/);
});

test("EXT-07 a 154 é aditiva e não altera 001–153", async () => {
  const sql = await hardening();
  assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE FROM\b/i);
  assert.doesNotMatch(sql, /\bINSERT INTO\b/i);
  assert.match(sql, /ALTER TABLE ext_compliance_documents/);
  assert.match(sql, /NOT VALID/);
});

test("EXT-07 a 154 corrige a unicidade de versão atual da 153", async () => {
  const previous = await journey();
  const sql = await hardening();
  assert.match(previous, /ext_compliance_current_version_unique/);
  assert.match(sql, /DROP INDEX IF EXISTS ext_compliance_current_version_unique/);
  assert.match(sql, /ext_compliance_documents_current_version_unique/);
  assert.match(sql, /superseded_by IS NULL/);
});

test("EXT-07 a 154 reforça renovação, versionamento e ciclo", async () => {
  const sql = await hardening();
  for (const token of ["superseded_by", "superseded_at", "renewal_justification", "version_root", "ext_compliance_no_self_supersede", "compliance version chain cycle detected"]) {
    assert.ok(sql.includes(token), `154 deveria declarar ${token}`);
  }
});

test("EXT-07 a 154 reforça estado temporal e privacidade estrutural", async () => {
  const sql = await hardening();
  assert.match(sql, /compliance state vigente is incompatible with an expired validity/);
  assert.match(sql, /privacy cannot be downgraded/);
  assert.match(sql, /ext_compliance_canonical_private/);
  assert.match(sql, /ext_compliance_canonical_no_storage_claim/);
});

test("EXT-07 a 154 faz a tarefa falhar fechado sem responsável e sem fatos", async () => {
  const sql = await hardening();
  assert.match(sql, /compliance task requires a canonical staff responsible/);
  assert.match(sql, /compliance task requires recorded facts/);
  assert.match(sql, /ext_compliance_task_responsible_required/);
});

test("EXT-07 a 154 usa ::text em comparações enum/TEXT", async () => {
  const sql = await hardening();
  assert.ok(sql.includes("origin::text"), "comparações de origin devem usar ::text");
  assert.ok(sql.includes("status::text"), "comparações de status devem usar ::text");
});

test("EXT-07 API distingue 401 de 403 e exige same-origin apenas em mutação", async () => {
  const source = await api();
  assert.match(source, /json\(res, 401, \{ error: "unauthorized" \}\)/);
  assert.match(source, /json\(res, 403, \{ error: "forbidden" \}\)/);
  assert.match(source, /if \(!sameOrigin\(req\)\) return json\(res, 403/);
});

test("EXT-07 API tem projeção minimizada, detalhe por allowlist e fronteira de arquivo", async () => {
  const source = await api();
  assert.match(source, /file_boundary/);
  assert.match(source, /referencia_declarada_nao_arquivo_verificado/);
  assert.match(source, /projection: "minimizada"/);
  assert.doesNotMatch(source, /LIST_COLUMNS = `[^`]*storage_key/);
  assert.doesNotMatch(source, /DETAIL_COLUMNS = `[^`]*storage_key/);
  assert.doesNotMatch(source, /DETAIL_COLUMNS = `[^`]*file_url/);
});

test("EXT-07 API usa data-base do servidor e recusa relógio do cliente", async () => {
  const source = await api();
  assert.match(source, /client_clock_not_accepted/);
  assert.match(source, /CURRENT_DATE/);
  assert.match(source, /source: "server_date"/);
});

test("EXT-07 API escopa a idempotência por método e rota", async () => {
  const source = await api();
  assert.match(source, /idempotency_key_reused/);
  assert.match(source, /fingerprint = \(method, route, body\)/);
  assert.match(source, /idempotency_key_required/);
});

test("EXT-07 API faz rollback e devolve 503 quando audit_log falha", async () => {
  const source = await api();
  assert.match(source, /audit_unavailable/);
  assert.match(source, /json\(res, 503, \{ error: "audit_unavailable" \}\)/);
  assert.match(source, /INSERT INTO audit_log/);
});

test("EXT-07 API não declara upload, bytes, checksum, malware scan nem download", async () => {
  const source = await api();
  assert.match(source, /file_claim_not_supported/);
  for (const forbidden of [/\bupload realizado\b/i, /\bchecksum verificado\b/i, /\bmalware scan\b.*\bexecutado\b/i, /\bdownload disponível\b/i]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("EXT-07 continua roteada no servidor e preserva o legado exato", async () => {
  const server = await read("server.mjs");
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/compliance\/"\)/);
  assert.match(server, /url\.pathname\.startsWith\("\/api\/ext\/compliance\/"\)\) return extComplianceApi\.handle/);
  for (const legacy of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents", "/api/ext/compliance-documents"]) {
    assert.ok(server.includes(legacy), `rota legada ausente: ${legacy}`);
  }
  assert.match(server, /legacy_writer_retired/);
});

test("EXT-07 não remove ExtAdvancedClient nem handlers EXT-08..12", async () => {
  const client = await read("src/app/admin/ti/ExtAdvancedClient.tsx");
  assert.ok(client.length > 0);
  const advanced = await read("src/server/ext-advanced-api.mjs");
  for (const handler of ["handleKnowledgeBase", "handleExpansionPlans", "handleContinuityPlans", "handleComplianceDocuments"]) {
    assert.ok(advanced.includes(handler), `handler ausente: ${handler}`);
  }
  assert.match(advanced, /projection:'minimizada'/);
});

test("EXT-07 manifesto e gate estático reconhecem 154", async () => {
  const migrator = await read("scripts/migrate-site-visual.mjs");
  assert.match(migrator, /'154-ext07-compliance-hardening\.sql'/);
  assert.match(migrator, /files\.length !== 154/);
  assert.match(migrator, /001–154 \(PostgreSQL only\)/);
  const staticGate = await read("scripts/qa-wave0-static.mjs");
  assert.match(staticGate, /const latestMigration = 154;/);
});
