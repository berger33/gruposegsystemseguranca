// EXT-07 — teste focal: migrações 153/154/155 estáticas + unidade da API com fake pool.
// Não toca banco real; a jornada HTTP/PostgreSQL é provada pelo gate dedicado
// (scripts/qa-ext07-compliance-postgres.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createExtComplianceApi } from "../src/server/ext-compliance-api.mjs";

const identityId = "22222222-2222-4222-8222-222222222222";
const otherIdentityId = "33333333-3333-4333-8333-333333333333";
const obligationId = "11111111-1111-4111-8111-111111111111";
const documentId = "88888888-8888-4888-8888-888888888888";
const taskId = "77777777-7777-4777-8777-777777777777";
const today = "2026-10-03";

const sql153 = () => readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
const sql154 = () => readFile(new URL("../db/migrations/154-ext07-compliance-hardening.sql", import.meta.url), "utf8");
const sql155 = () => readFile(new URL("../db/migrations/155-ext07-compliance-hardening.sql", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Migrações: fonte canônica, legado preservado e hardening aditivo da 154+155.
// ---------------------------------------------------------------------------

test("EXT-07 usa ext_compliance_documents como fonte canônica e preserva legado", async () => {
  const migration = await sql153();
  assert.match(migration, /origin TEXT NOT NULL DEFAULT 'registro_legado'/);
  assert.match(migration, /ext07_canonica/);
  assert.doesNotMatch(migration, /CREATE TABLE ext_compliance_documents/);
});

test("EXT-07 impõe documento privado, validade e tarefa idempotente", async () => {
  const migration = await sql153();
  for (const fragment of ["is_private", "expiry_date", "ext_compliance_tasks", "UNIQUE(document_id,validity_period,rule)", "ext_compliance_events"]) {
    assert.match(migration, new RegExp(fragment.replaceAll("(", "\\(").replaceAll(")", "\\)"), "i"));
  }
});

test("EXT-07 histórico é imutável e conclusão exige responsável/resultado", async () => {
  const migration = await sql153();
  assert.match(migration, /compliance historical record is immutable/);
  assert.match(migration, /task completion requires responsible and result/);
});

test("EXT-07 154 (main) preserva constraints compatíveis; 155 corrige as incompatíveis sem reescrever 001–154", async () => {
  const main154 = await sql154();
  for (const kept of ["ext_compliance_private_canonical", "ext_compliance_issue_start", "ext_compliance_expiry_rule", "ext_compliance_task_owner", "ext_compliance_version_positive", "ext_compliance_events_entity_idx"]) {
    assert.ok(main154.includes(kept), `154 do main deve preservar ${kept}`);
  }
  const migration = await sql155();
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'substituida'/);
  assert.match(migration, /DROP INDEX IF EXISTS ext_compliance_current_version_unique/);
  assert.match(migration, /DROP INDEX IF EXISTS ext_compliance_one_current_version/);
  assert.match(migration, /ext_compliance_current_document_unique/);
  assert.match(migration, /status IN \('vigente','a_vencer','em_renovacao'\)/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS ext_compliance_task_dates/);
  assert.match(migration, /terminal compliance document is immutable/);
  assert.match(migration, /canonical compliance document requires a declared reference/);
  assert.match(migration, /vigente compliance document cannot have an expired validity/);
  assert.match(migration, /compliance task is born open/);
  assert.match(migration, /compliance task requires a staff responsible \(fail closed\)/);
  assert.match(migration, /invalid compliance task transition/);
  assert.match(migration, /replacement_of IS NULL OR replacement_of <> id/);
  for (const constraint of ["ext_compliance_replacement_no_self_check", "ext_compliance_canonical_reference_check"]) {
    assert.match(migration, new RegExp(constraint));
    assert.ok(migration.includes(`${constraint}\n  CHECK`) || migration.includes(`${constraint} CHECK`));
  }
  assert.match(migration, /NOT VALID/g);
  assert.doesNotMatch(migration, /INSERT INTO ext_compliance_/);
  assert.doesNotMatch(migration, /UPDATE ext_compliance_documents SET/);
});

// ---------------------------------------------------------------------------
// API: regex de data correta (a 153 usava \\d e nunca casava), projeção e rotas.
// ---------------------------------------------------------------------------

test("EXT-07 API usa regex de data correta e não aceita relógio do cliente", async () => {
  const source = await readFile(new URL("../src/server/ext-compliance-api.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\\\\d\{/); // o bug duplo-escapado da 153 não pode voltar
  assert.match(source, /ISO_DATE/);
  assert.match(source, /CURRENT_DATE::text AS today/);
  assert.doesNotMatch(source, /b\.evaluation_date/);
  assert.match(source, /file_boundary/);
  assert.match(source, /referencia_declarada_nao_arquivo_verificado/);
  assert.match(source, /idempotency_key_reused/);
  assert.match(source, /audit_unavailable/);
  for (const route of ["/api/ext/compliance/documents", "/api/ext/compliance/obligations", "/api/ext/compliance/tasks", "/api/ext/compliance/evaluate", "/renew$/"]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/").replaceAll("$", "\\$")));
  }
});

// ---------------------------------------------------------------------------
// Fake pool: HTTP semântico do handler sem banco real.
// ---------------------------------------------------------------------------

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = "/api/ext/compliance/obligations", body, raw, key = "ext07-focal-key-0001", origin = "https://admin.test" } = {}) {
  const bytes = raw !== undefined ? [Buffer.from(raw)] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "admin.test", ...(origin === null ? {} : { origin }) };
  if (key !== null) headers["idempotency-key"] = key;
  return { method, url, headers, async *[Symbol.asyncIterator]() { yield* bytes; } };
}

function api(pool, { session = { identityId, role: "ti" }, origin = true } = {}) {
  return createExtComplianceApi({ pool, sameOrigin: () => origin, requireSession: async () => session });
}

function readPool(rows = []) {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      for (const [needle, result] of rows) if (String(sql).includes(needle)) return result;
      return { rows: [] };
    },
  };
  return { statements, pool };
}

const obligationRow = {
  id: obligationId, obligation_type: "licenca", title: "Licença sintética", status: "pendente",
  responsible_identity: identityId, validity_rule: "validade_anual_renovavel", renewal_lead_days: 30,
};

const documentRow = {
  id: documentId, protocol: "COMP-EXT-20261003-AB12", origin: "ext07_canonica", status: "vigente",
  obligation_id: obligationId, responsible_identity: identityId, version_no: 1, replacement_of: null,
  compliance_type: "licenca", reference_type: "referencia_declarada", declared_reference: "REF-SINTETICA-0001",
  document_number: null, issuer: null, reference_source: "Órgão sintético", validity_rule: "validade_anual_renovavel",
};

function mutationPool({
  replayRow = null,
  obligation = obligationRow,
  document = documentRow,
  task = { id: taskId, status: "aberta", responsible_identity: identityId },
  activeStaff = true,
  expiredDocuments = [],
  failAudit = false,
} = {}) {
  const statements = [];
  const client = {
    async query(rawSql, params) {
      statements.push({ sql: rawSql, params });
      const sql = String(rawSql).replace(/\s+/g, " ");
      if (sql.includes("INSERT INTO audit_log")) {
        if (failAudit) throw new Error("audit offline");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM ext_compliance_events WHERE created_by_identity=$1 AND idempotency_key=$2")) {
        return { rows: replayRow ? [replayRow] : [] };
      }
      if (sql.includes("FROM auth_identities")) return { rows: activeStaff ? [{ id: params[0] }] : [] };
      if (sql.includes("SELECT CURRENT_DATE::text")) return { rows: [{ today }] };
      if (sql.includes("FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE")) {
        return { rows: obligation ? [{ ...obligation }] : [] };
      }
      if (sql.includes("FROM ext_compliance_documents WHERE id=$1 FOR UPDATE")) {
        return { rows: document ? [{ ...document }] : [] };
      }
      if (sql.includes("FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE")) {
        return { rows: task ? [{ ...task }] : [] };
      }
      if (sql.includes("FROM ext_compliance_documents d") && sql.includes("FOR UPDATE OF d")) {
        return { rows: expiredDocuments.map(d => ({ ...d })) };
      }
      if (sql.startsWith("INSERT INTO ext_compliance_obligations")) {
        return { rows: [{ ...obligation, id: obligationId, responsible_identity: params[9], created_by_identity: params[10], status: "pendente" }] };
      }
      if (sql.startsWith("INSERT INTO ext_compliance_documents")) {
        return { rows: [{ ...document, id: documentId, status: params[4], is_private: true, version_no: 1 }] };
      }
      if (sql.startsWith("INSERT INTO ext_compliance_tasks")) {
        return { rows: [{ id: taskId }] };
      }
      if (sql.startsWith("UPDATE ext_compliance_documents SET status='substituida'")) {
        return { rows: [{ id: documentId, status: "substituida" }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE ext_compliance_documents")) {
        return { rows: [{ id: documentId, status: "vencida" }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE ext_compliance_tasks")) {
        return { rows: [{ ...task, status: params[1] }] };
      }
      if (sql.startsWith("INSERT INTO ext_compliance_events")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE ext_compliance_obligations")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

// SQL de produção é multilinha: comparações usam a forma normalizada e âncoras
// de tabela em INSERT, nunca match amplo.
function sqlIndex(statements, needle) {
  return statements.findIndex(s => String(s.sql).replace(/\s+/g, " ").includes(needle));
}

const obligationBody = {
  obligation_type: "licenca", title: "Licença sintética de operação",
  description: "Descrição sintética suficientemente longa para QA.",
  declared_source: "Política interna sintética versão 1", applicability_scope: "Unidade sintética",
  applicability_justification: "Aplicabilidade declarada sinteticamente.", validity_rule: "validade_anual_renovavel",
  responsible_identity: identityId,
};

test("EXT-07 anônimo recebe 401 sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool, { session: null }).handle(request({}), res);
  assert.equal(res.status, 401);
  assert.equal(statements.length, 0);
});

test("EXT-07 papel autenticado não autorizado recebe 403 sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool, { session: { identityId, role: "rh" } }).handle(request({}), res);
  assert.equal(res.status, 403);
  assert.equal(statements.length, 0);
});

test("EXT-07 mutação cross-origin é recusada antes da chave e do corpo", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool, { origin: false }).handle(request({ method: "POST", body: obligationBody }), res);
  assert.equal(res.status, 403);
  assert.equal(statements.length, 0);
});

test("EXT-07 mutação exige Idempotency-Key", async () => {
  const { pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handle(request({ method: "POST", body: obligationBody, key: null }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "idempotency_key_required");
});

test("EXT-07 JSON inválido retorna 400 e corpo grande 413", async () => {
  const { pool } = mutationPool();
  const bad = responseCapture();
  await api(pool).handle(request({ method: "POST", raw: "{" }), bad);
  assert.equal(bad.status, 400);
  const big = responseCapture();
  await api(pool).handle(request({ method: "POST", raw: JSON.stringify({ x: "y".repeat(140 * 1024) }) }), big);
  assert.equal(big.status, 413);
});

test("EXT-07 criação de obrigação deriva autoria/estado e exige responsável staff", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handle(request({ method: "POST", body: { ...obligationBody, status: "encerrada", created_by_identity: otherIdentityId } }), res);
  assert.equal(res.status, 201);
  const insert = statements[sqlIndex(statements, "INSERT INTO ext_compliance_obligations")];
  assert.ok(insert, "INSERT em ext_compliance_obligations deve ocorrer");
  assert.equal(insert.params[9], identityId, "responsável canônico vem do corpo validado");
  assert.equal(insert.params[10], identityId, "autoria vem da sessão, não do corpo");
  assert.equal(res.payload.obligation.status, "pendente", "estado deriva do servidor");

  const unauthorized = responseCapture();
  const unauthorizedPool = mutationPool({ activeStaff: false });
  await api(unauthorizedPool.pool).handle(request({ method: "POST", body: obligationBody }), unauthorized);
  assert.equal(unauthorized.status, 400);
  assert.equal(unauthorized.payload.error, "responsible_staff_required");
});

test("EXT-07 UUID inválido retorna 400 em documento, detalhe e tarefa", async () => {
  const { pool } = mutationPool();
  const document = responseCapture();
  await api(pool).handle(request({ method: "POST", url: "/api/ext/compliance/documents", body: { title: "Referência sintética", description: "Descrição sintética da referência.", obligation_id: "não-uuid" } }), document);
  assert.equal(document.status, 400);
  const detail = responseCapture();
  await api(pool).handle(request({ url: "/api/ext/compliance/documents/não-uuid" }), detail);
  assert.equal(detail.status, 400);
  const transition = responseCapture();
  await api(pool).handle(request({ method: "POST", url: `/api/ext/compliance/tasks/não-uuid/start`, body: {} }), transition);
  assert.equal(transition.status, 400);
});

test("EXT-07 documento com datas inválidas retorna 400 e estado derivado do servidor", async () => {
  const cases = [
    { body: { issue_date: "2026-10-04", expiry_date: "2026-10-10" }, error: "issue_date_in_future" },
    { body: { issue_date: "2026-09-01", expiry_date: "2026-08-01" }, error: "invalid_validity" },
    { body: { issue_date: "2026-09-01", expiry_date: "2026-10-10", effective_start_date: "2026-10-20" }, error: "invalid_validity" },
    { body: { issue_date: "2026-09-01", expiry_date: "2026-10-10" }, error: "private_reference_required" },
  ];
  for (const { body, error } of cases) {
    const { pool } = mutationPool();
    const res = responseCapture();
    await api(pool).handle(request({
      method: "POST", url: "/api/ext/compliance/documents",
      body: { obligation_id: obligationId, title: "Referência sintética", description: "Descrição sintética da referência.", ...body },
    }), res);
    assert.equal(res.status, 400, body.issue_date);
    assert.equal(res.payload.error, error);
  }
  const { statements, pool } = mutationPool();
  const ok = responseCapture();
  await api(pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents",
    body: {
      obligation_id: obligationId, title: "Referência sintética", description: "Descrição sintética da referência.",
      issue_date: "2026-09-01", expiry_date: "2026-10-10", reference_type: "referencia_declarada",
      declared_reference: "REF-SINTETICA-0001", status: "cancelada", is_private: false,
    },
  }), ok);
  assert.equal(ok.status, 201);
  const insert = statements[sqlIndex(statements, "INSERT INTO ext_compliance_documents")];
  assert.ok(insert);
  assert.equal(insert.params[4], "vigente", "estado derivado do servidor (validade futura)");
  assert.equal(ok.payload.document.is_private, true);
});

test("EXT-07 avaliação usa CURRENT_DATE do servidor e ignora data do cliente", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: { evaluation_date: "2030-01-01" } }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.source, "server_date");
  assert.equal(res.payload.evaluation_date, today);
  assert.equal(res.payload.absence_is_not_zero, true);
  const select = statements.find(s => /FROM ext_compliance_documents d/.test(String(s.sql).replace(/\s+/g, " ")));
  assert.ok(select, "seleção de vencidos deve ocorrer");
  assert.match(String(select.sql).replace(/\s+/g, " "), /CURRENT_DATE/);
  assert.match(String(select.sql).replace(/\s+/g, " "), /NOT IN \('cancelada','substituida'\)/);
  for (const statement of statements) {
    assert.doesNotMatch(String(statement.sql), /\$[0-9]+::date/, "nenhuma data do cliente vira parâmetro");
    if (statement.params) assert.ok(!statement.params.includes("2030-01-01"), "data do cliente nunca é persistida");
  }
});

test("EXT-07 transições de tarefa exigem resultado/justificativa e respeitam terminais", async () => {
  const missingResult = responseCapture();
  await api(mutationPool().pool).handle(request({ method: "POST", url: `/api/ext/compliance/tasks/${taskId}/complete`, body: {} }), missingResult);
  assert.equal(missingResult.status, 400);
  const missingJustification = responseCapture();
  await api(mutationPool().pool).handle(request({ method: "POST", url: `/api/ext/compliance/tasks/${taskId}/cancel`, body: {} }), missingJustification);
  assert.equal(missingJustification.status, 400);
  const terminal = responseCapture();
  await api(mutationPool({ task: { id: taskId, status: "concluida", responsible_identity: identityId } }).pool)
    .handle(request({ method: "POST", url: `/api/ext/compliance/tasks/${taskId}/start`, body: {} }), terminal);
  assert.equal(terminal.status, 409);
  const completeWithoutResponsible = responseCapture();
  await api(mutationPool({ task: { id: taskId, status: "aberta", responsible_identity: otherIdentityId }, activeStaff: false }).pool)
    .handle(request({ method: "POST", url: `/api/ext/compliance/tasks/${taskId}/complete`, body: { result: "Resultado sintético suficientemente detalhado." } }), completeWithoutResponsible);
  assert.equal(completeWithoutResponsible.status, 409);
});

test("EXT-07 renovação cria novo registro e marca o anterior como substituído", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handle(request({
    method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`,
    body: { issue_date: "2026-10-01", expiry_date: "2027-10-01", declared_reference: "REF-RENOVADA-0001", justification: "Renovação sintética justificada." },
  }), res);
  assert.equal(res.status, 201, JSON.stringify(res.payload));
  const supersede = sqlIndex(statements, "UPDATE ext_compliance_documents SET status='substituida'");
  const insert = sqlIndex(statements, "INSERT INTO ext_compliance_documents");
  assert.ok(supersede >= 0, "versão anterior deve ser substituída");
  assert.ok(insert > supersede, "novo registro é inserido após substituir o anterior");
  assert.equal(res.payload.previous.status, "substituida");
  assert.equal(res.payload.document.version_no, 1);
  const terminal = responseCapture();
  await api(mutationPool({ document: { ...documentRow, status: "substituida" } }).pool)
    .handle(request({ method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`, body: { issue_date: "2026-10-01", expiry_date: "2027-10-01", declared_reference: "REF-RENOVADA-0002", justification: "Renovação sintética justificada." } }), terminal);
  assert.equal(terminal.status, 409);
});

test("EXT-07 replay idempotente devolve 200 e chave divergente 409", async () => {
  const replayRow = {
    request_fingerprint: null, payload: { obligation: { id: obligationId }, replayedMarker: true },
  };
  const { pool } = mutationPool({ replayRow });
  const res = responseCapture();
  // O fingerprint do corpo vazio precisa coincidir; recomputamos igual ao handler.
  const { createHash } = await import("node:crypto");
  replayRow.request_fingerprint = createHash("sha256").update(JSON.stringify({}, [])).digest("hex");
  await api(pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: undefined, key: "ext07-retry-key-0001" }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);

  const divergentPool = mutationPool({ replayRow: { ...replayRow, request_fingerprint: "0".repeat(64) } });
  const divergent = responseCapture();
  await api(divergentPool.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {}, key: "ext07-retry-key-0001" }), divergent);
  assert.equal(divergent.status, 409);
  assert.equal(divergent.payload.error, "idempotency_key_reused");
});

test("EXT-07 falha de audit_log responde 503 com rollback e sem evento", async () => {
  const { statements, pool } = mutationPool({ failAudit: true });
  const res = responseCapture();
  await api(pool).handle(request({ method: "POST", body: obligationBody, key: "ext07-audit-key-0001" }), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_unavailable");
  const rollback = sqlIndex(statements, "ROLLBACK");
  const commit = statements.findIndex(s => String(s.sql).replace(/\s+/g, " ") === "COMMIT");
  assert.ok(rollback > 0, "rollback deve ocorrer");
  assert.equal(commit, -1, "nenhum COMMIT pode ocorrer");
});

test("EXT-07 listagens usam projeção minimizada sem storage_key, URL privada ou referência", async () => {
  const { statements, pool } = readPool();
  for (const url of ["/api/ext/compliance/documents", "/api/ext/compliance/obligations", "/api/ext/compliance/tasks"]) {
    const res = responseCapture();
    await api(pool).handle(request({ url }), res);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.payload.items));
  }
  const documents = String(statements.find(s => /FROM ext_compliance_documents d/.test(String(s.sql))).sql).replace(/\s+/g, " ");
  assert.doesNotMatch(documents, /storage_key/);
  assert.doesNotMatch(documents, /file_url/);
  assert.doesNotMatch(documents, /file_name/);
  assert.doesNotMatch(documents, /declared_reference/);
  assert.doesNotMatch(documents, /document_number/);
  const legacy = await readFile(new URL("../src/server/ext-advanced-api.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(legacy, /INSERT INTO ext_compliance_documents/);
  assert.doesNotMatch(legacy, /UPDATE ext_compliance_documents/);
});
