// EXT-07 — suíte focal da jornada canônica de compliance corporativo.
//
// O que esta suíte prova: o contrato do módulo (fronteiras de ator, papel,
// idempotência, validade, privacidade, renovação e tarefa) e o contrato
// declarado nas migrações 153/154.
//
// O que esta suíte NÃO prova: jornada por HTTP real contra PostgreSQL real.
// Isso é responsabilidade de `npm run test:ext07-compliance:pg`, que sobe
// cluster descartável, servidor de verdade e sessão staff real.
//
// Disciplina dos fake pools, para que o teste não vire espelho do código:
//   * todo SQL é normalizado em espaço único antes de comparar;
//   * nome de tabela em INSERT é ancorado (`INSERT INTO <tabela>` seguido de
//     fronteira de palavra), nunca `includes` largo que casa com qualquer SQL;
//   * datas são comparadas em ISO (AAAA-MM-DD);
//   * asserção negativa usa pai recém-criado, nunca o pai de outro caso.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  createExtComplianceApi,
  COMPLIANCE_ROLES,
  COMPLIANCE_RESPONSIBLE_ROLES,
  OBLIGATION_TYPES,
  DOCUMENT_TYPES,
  REFERENCE_TYPES,
  EXPIRY_TASK_RULE,
  DOCUMENT_BOUNDARY,
  LEGAL_BOUNDARY,
  CONTINUOUS_MONITORING_NOTE,
} from "../src/server/ext-compliance-api.mjs";

const identityId = "11111111-1111-4111-8111-111111111111";
const otherIdentityId = "22222222-2222-4222-8222-222222222222";
const obligationId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const renewalId = "55555555-5555-4555-8555-555555555555";
const taskId = "66666666-6666-4666-8666-666666666666";

const TODAY = "2026-10-03";
const PAST = "2026-09-01";
const OLDER = "2025-09-01";
const FUTURE = "2027-10-03";

/** Normaliza whitespace: o teste compara intenção do SQL, não formatação. */
const normalize = sql => String(sql).replace(/\s+/g, " ").trim();
/** Âncora de INSERT por tabela: evita casar com qualquer SQL que cite o nome. */
const insertsInto = (statements, table) =>
  statements.filter(entry => new RegExp(`INSERT INTO ${table}\\b`).test(normalize(entry.sql)));
const ran = (statements, needle) => statements.some(entry => normalize(entry.sql).includes(needle));

function responseCapture() {
  return {
    status: 0, payload: null, headers: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.payload = body ? JSON.parse(body) : null; },
  };
}

function request({ method = "GET", url = "/api/ext/compliance/obligations", body, key = "ext07-unit-key-0001", headers = {} } = {}) {
  const chunks = body === undefined
    ? []
    : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const base = { host: "admin.test", origin: "https://admin.test", ...headers };
  if (key !== null) base["idempotency-key"] = key;
  return { method, url, headers: base, async *[Symbol.asyncIterator]() { yield* chunks; } };
}

function api(pool, { session = { identityId, role: "ti" }, origin = true } = {}) {
  return createExtComplianceApi({ pool, sameOrigin: () => origin, requireSession: async () => session });
}

/**
 * Pool sintético. `facts` controla o estado do mundo por caso; nenhum caso
 * herda o estado de outro.
 */
function scenario({
  replayEvent = null,
  failAudit = false,
  responsibleActive = true,
  obligationStatus = "pendente",
  documentRow = null,
  taskRow = null,
  documentsToEvaluate = [],
  taskInsertConflict = false,
} = {}) {
  const statements = [];
  let storedEvent = replayEvent;
  const obligation = {
    id: obligationId, obligation_type: "licenca", title: "Licenca sintetica EXT-07",
    description: "Obrigacao sintetica declarada pela equipe interna.",
    declared_source: "Fonte declarada sintetica .invalid", applicability_scope: "matriz sintetica",
    applicability_justification: "Justificativa sintetica de aplicabilidade.",
    validity_rule: "anual_com_renovacao_declarada", renewal_lead_days: 30, criticality: "alta",
    status: obligationStatus, responsible_identity: identityId, created_by_identity: identityId,
  };

  const client = {
    async query(raw, params = []) {
      statements.push({ sql: raw, params });
      const sql = normalize(raw);

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("SELECT CURRENT_DATE::text AS today")) return { rows: [{ today: TODAY }] };
      if (sql.includes("AS limit_date")) {
        const base = new Date(`${params[0]}T00:00:00Z`);
        base.setUTCDate(base.getUTCDate() + Number(params[1]));
        return { rows: [{ limit_date: base.toISOString().slice(0, 10) }] };
      }
      if (sql.includes("($1::date - $2::date) AS days")) {
        const days = Math.round((Date.parse(`${params[0]}T00:00:00Z`) - Date.parse(`${params[1]}T00:00:00Z`)) / 86400000);
        return { rows: [{ days }] };
      }
      if (sql.includes("FROM auth_identities i JOIN auth_staff_profiles p")) {
        return responsibleActive || params[0] === identityId
          ? { rows: [{ id: params[0], display_name: "QA EXT-07", role: "ti" }] }
          : { rows: [] };
      }
      if (sql.includes("FROM ext_compliance_events WHERE created_by_identity = $1 AND idempotency_key = $2")) {
        return { rows: storedEvent ? [storedEvent] : [] };
      }
      if (sql.includes("FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE")) {
        return { rows: [obligation] };
      }
      if (insertsInto([{ sql }], "ext_compliance_obligations").length) {
        return { rows: [{ id: obligationId, obligation_type: params[0], title: params[1], status: "pendente", responsible_identity: params[9], created_by_identity: params[10], created_at: `${TODAY}T00:00:00.000Z` }] };
      }
      if (sql.includes("FROM ext_compliance_documents WHERE id = $1 AND origin = 'ext07_canonica' FOR UPDATE")) {
        return { rows: documentRow ? [documentRow] : [] };
      }
      if (insertsInto([{ sql }], "ext_compliance_documents").length) {
        // A renovação insere com `id` explícito (ver 154 e a FK adiada); a
        // criação deixa o banco gerar. Alinhamos os dois formatos.
        const renewing = sql.includes("INSERT INTO ext_compliance_documents (id, protocol");
        const p = renewing ? params.slice(1) : params;
        return {
          rows: [{
            id: renewing ? params[0] : documentId, protocol: p[0], title: p[1], description: p[2],
            compliance_type: p[3], status: p[4], document_number: p[5], issuer: p[6],
            responsible_name: p[7], responsible_identity: p[8], issue_date: p[9],
            effective_start_date: p[10], expiry_date: p[11], validity_rule: p[12],
            evaluation_date: p[13], reference_type: p[14], declared_reference: p[15],
            reference_source: p[16], created_by_identity: p[17], obligation_id: p[18],
            origin: "ext07_canonica", version_no: p[19] ?? 1, replacement_of: p[20] ?? null,
            renewal_justification: p[21] ?? null, superseded_by: null, is_private: true,
            storage_key: "NUNCA-DEVE-VAZAR", file_url: "https://nunca.invalid/privado.pdf",
          }],
        };
      }
      if (sql.includes("FROM ext_compliance_documents d JOIN ext_compliance_obligations o")) {
        return { rows: documentsToEvaluate };
      }
      if (sql.includes("UPDATE ext_compliance_documents SET superseded_by")) return { rows: [] };
      if (sql.includes("UPDATE ext_compliance_documents SET status")) return { rows: [] };
      if (sql.includes("FROM ext_compliance_tasks WHERE id = $1 FOR UPDATE")) {
        return { rows: taskRow ? [taskRow] : [] };
      }
      if (insertsInto([{ sql }], "ext_compliance_tasks").length) {
        return taskInsertConflict
          ? { rows: [] }
          : { rows: [{ id: taskId }] };
      }
      if (sql.includes("UPDATE ext_compliance_tasks SET status = $2")) {
        return { rows: [{ ...taskRow, status: params[1], completion_result: params[2], cancellation_justification: params[3], completed_by_identity: params[1] === "concluida" ? params[4] : null, cancelled_by_identity: params[1] === "cancelada" ? params[4] : null }] };
      }
      if (insertsInto([{ sql }], "ext_compliance_events").length) {
        storedEvent = { payload: JSON.parse(params[4]), request_fingerprint: params[6] };
        return { rows: [] };
      }
      if (insertsInto([{ sql }], "audit_log").length) {
        if (failAudit) throw new Error("audit_log offline");
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };

  return {
    statements,
    get event() { return storedEvent; },
    pool: { connect: async () => client, query: async (...args) => client.query(...args) },
  };
}

const validObligation = {
  obligation_type: "licenca", title: "Licenca sintetica EXT-07",
  description: "Obrigacao sintetica declarada pela equipe interna.",
  declared_source: "Fonte declarada sintetica .invalid", applicability_scope: "matriz sintetica",
  applicability_justification: "Justificativa sintetica de aplicabilidade.",
  validity_rule: "anual_com_renovacao_declarada", criticality: "alta", responsible_identity: identityId,
};
const validDocument = {
  obligation_id: obligationId, title: "Documento sintetico EXT-07",
  description: "Referencia documental sintetica declarada.", compliance_type: "licenca",
  issue_date: OLDER, expiry_date: PAST, reference_type: "referencia_declarada",
  declared_reference: "REF-SINTETICA-0001", reference_source: "registro interno sintetico",
};

// ---------------------------------------------------------------------------
// Fronteiras declaradas
// ---------------------------------------------------------------------------
test("EXT-07 declara fronteira documental sem upload, bytes ou armazenamento", () => {
  assert.match(DOCUMENT_BOUNDARY, /referencia_declarada_nao_arquivo_verificado/);
  for (const forbidden of ["upload", "bytes", "checksum", "malware scan", "armazenamento verificado", "download"]) {
    assert.ok(DOCUMENT_BOUNDARY.includes(forbidden), `fronteira precisa negar ${forbidden}`);
  }
});

test("EXT-07 declara ausência de validação jurídica e de órgão público", () => {
  assert.match(LEGAL_BOUNDARY, /sem validacao juridica/);
  assert.match(LEGAL_BOUNDARY, /sem confirmacao por orgao publico/);
});

test("EXT-07 declara que monitoramento contínuo exige agendamento futuro", () => {
  assert.match(CONTINUOUS_MONITORING_NOTE, /nao existe execucao agendada/);
  assert.match(CONTINUOUS_MONITORING_NOTE, /agendamento futuro/);
});

test("EXT-07 mantém papéis de staff e responsável canônico explícitos", () => {
  assert.deepEqual(COMPLIANCE_ROLES, ["admin", "ti"]);
  assert.deepEqual(COMPLIANCE_RESPONSIBLE_ROLES, ["admin", "ti"]);
  assert.ok(!COMPLIANCE_ROLES.includes("rh"));
});

test("EXT-07 declara catálogos de tipo e de referência", () => {
  assert.ok(OBLIGATION_TYPES.includes("obrigacao_legal"));
  assert.ok(DOCUMENT_TYPES.includes("certidao"));
  assert.deepEqual(REFERENCE_TYPES, ["referencia_declarada", "protocolo_interno", "registro_externo_declarado"]);
});

// ---------------------------------------------------------------------------
// 401 / 403 / same-origin
// ---------------------------------------------------------------------------
test("EXT-07 anônimo recebe 401 e a resposta É escrita", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool, { session: null }).handle(request(), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "admin_session_required");
  assert.equal(res.payload.actor_boundary, "staff_interno");
});

test("EXT-07 papel autenticado sem direito recebe 403, não 401", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool, { session: { identityId, role: "rh" } }).handle(request(), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "compliance_role_required");
});

test("EXT-07 sessão sem identidade UUID real é recusada com 403", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool, { session: { identityId: "nao-e-uuid", role: "ti" } }).handle(request(), res);
  assert.equal(res.status, 403);
});

test("EXT-07 mutação cross-origin é recusada com 403 antes de tocar o banco", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool, { origin: false }).handle(
    request({ method: "POST", body: validObligation }), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "cross_origin_rejected");
  assert.equal(insertsInto(world.statements, "ext_compliance_obligations").length, 0);
});

test("EXT-07 leitura não exige same-origin", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool, { origin: false }).handle(request(), res);
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------------------
// Corpo, chave e campos forjados
// ---------------------------------------------------------------------------
test("EXT-07 JSON inválido devolve 400", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", body: "{nao-e-json" }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_json");
});

test("EXT-07 corpo acima do limite devolve 413", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(
    request({ method: "POST", body: { title: "x".repeat(70 * 1024) } }), res);
  assert.equal(res.status, 413);
  assert.equal(res.payload.error, "payload_too_large");
});

test("EXT-07 mutação sem Idempotency-Key devolve 400", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", body: validObligation, key: null }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "idempotency_key_required");
});

test("EXT-07 recusa id, autoria, estado e contador forjados no corpo", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST",
    body: { ...validObligation, id: obligationId, created_by_identity: otherIdentityId, status: "vigente", version_no: 9 },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "server_owned_field_rejected");
  assert.deepEqual(res.payload.fields.sort(), ["created_by_identity", "id", "status", "version_no"]);
  assert.equal(insertsInto(world.statements, "ext_compliance_obligations").length, 0);
});

test("EXT-07 autoria gravada vem da sessão, nunca do corpo", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", body: validObligation }), res);
  assert.equal(res.status, 201);
  const [insert] = insertsInto(world.statements, "ext_compliance_obligations");
  assert.equal(insert.params[10], identityId);
  assert.equal(res.payload.obligation.created_by_identity, identityId);
});

// ---------------------------------------------------------------------------
// Obrigação
// ---------------------------------------------------------------------------
test("EXT-07 recusa tipo de obrigação fora do catálogo", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", body: { ...validObligation, obligation_type: "tipo_inventado" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_obligation_type");
});

test("EXT-07 exige fonte, escopo e justificativa de aplicabilidade", async () => {
  for (const field of ["declared_source", "applicability_scope", "applicability_justification", "validity_rule"]) {
    const world = scenario();
    const res = responseCapture();
    const body = { ...validObligation };
    delete body[field];
    await api(world.pool).handle(request({ method: "POST", body }), res);
    assert.equal(res.status, 400, `campo ${field} deveria ser obrigatório`);
    assert.equal(res.payload.error, "invalid_obligation_payload");
  }
});

test("EXT-07 recusa responsável que não é staff ativo autorizado", async () => {
  // Pai recém-criado só para a asserção negativa: responsável inativo.
  const world = scenario({ responsibleActive: false });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", body: { ...validObligation, responsible_identity: otherIdentityId },
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "responsible_staff_required");
  assert.equal(insertsInto(world.statements, "ext_compliance_obligations").length, 0);
});

test("EXT-07 recusa responsável que não é UUID", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", body: { ...validObligation, responsible_identity: "equipe-de-compliance" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_responsible_identity");
});

test("EXT-07 não apresenta obrigação como validação jurídica", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", body: validObligation }), res);
  assert.equal(res.payload.legal_validation, "nao_realizada");
  assert.equal(res.payload.legal_validation_note, LEGAL_BOUNDARY);
});

// ---------------------------------------------------------------------------
// Documento, validade e privacidade
// ---------------------------------------------------------------------------
test("EXT-07 recusa documento com data fora do formato ISO", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents",
    body: { ...validDocument, issue_date: "01/09/2026" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_dates");
});

test("EXT-07 recusa data de calendário impossível", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents",
    body: { ...validDocument, issue_date: "2026-02-31" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_dates");
});

test("EXT-07 recusa vencimento anterior à emissão", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents",
    body: { ...validDocument, issue_date: PAST, expiry_date: OLDER },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "expiry_before_issue_or_start");
});

test("EXT-07 recusa início de vigência anterior à emissão", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents",
    body: { ...validDocument, issue_date: PAST, effective_start_date: OLDER, expiry_date: FUTURE },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "effective_start_before_issue");
});

test("EXT-07 recusa referência documental ausente ou de tipo inventado", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents",
    body: { ...validDocument, reference_type: "arquivo_enviado" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "declared_reference_required");
  assert.equal(res.payload.file_boundary, DOCUMENT_BOUNDARY);
});

test("EXT-07 deriva estado temporal da data-base do servidor, em ISO", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents", body: validDocument,
  }), res);
  assert.equal(res.status, 201);
  assert.equal(res.payload.validity.base_date, TODAY);
  assert.equal(res.payload.validity.base_date_source, "postgres_current_date");
  // PAST < TODAY, logo o estado é vencida — e não "vigente" enviado por cliente.
  assert.equal(res.payload.validity.derived_status, "vencida");
  assert.equal(res.payload.document.expiry_date, PAST);
});

test("EXT-07 grava documento privado e não devolve storage_key nem file_url", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents", body: validDocument,
  }), res);
  assert.equal(res.payload.document.is_private, true);
  assert.equal(res.payload.privacy.is_private, true);
  assert.ok(!("storage_key" in res.payload.document));
  assert.ok(!("file_url" in res.payload.document));
  assert.ok(!JSON.stringify(res.payload).includes("NUNCA-DEVE-VAZAR"));
});

test("EXT-07 recusa documento de obrigação encerrada", async () => {
  const world = scenario({ obligationStatus: "encerrada" });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/documents", body: validDocument,
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "obligation_not_active");
});

test("EXT-07 listagem minimiza projeção e mascara número documental", async () => {
  const rows = [{
    id: documentId, protocol: "COMP-EXT-20261003-AB12", title: "Documento sintetico",
    compliance_type: "licenca", status: "vencida", obligation_id: obligationId, origin: "ext07_canonica",
    issue_date: OLDER, effective_start_date: OLDER, expiry_date: PAST, evaluation_date: TODAY,
    validity_rule: "anual", reference_type: "referencia_declarada", version_no: 1, is_private: true,
    superseded_by: null, replacement_of: null, responsible_identity: identityId, created_at: `${TODAY}T00:00:00.000Z`,
    document_number: "ABC-987654321", declared_reference: "REF-PRIVADA-NAO-LISTAR",
    storage_key: "NUNCA-DEVE-VAZAR", file_url: "https://nunca.invalid/privado.pdf",
  }];
  const world = scenario();
  world.pool.query = async sql => (normalize(sql).includes("SELECT CURRENT_DATE::text AS today")
    ? { rows: [{ today: TODAY }], rowCount: 1 }
    : { rows, rowCount: rows.length });
  world.pool.connect = async () => ({ query: world.pool.query, release() {} });
  const res = responseCapture();
  await api(world.pool).handle(request({ url: "/api/ext/compliance/documents" }), res);
  assert.equal(res.status, 200);
  const [item] = res.payload.items;
  assert.equal(item.document_number_masked, "****4321");
  assert.ok(!("document_number" in item));
  assert.ok(!("declared_reference" in item));
  assert.ok(!("storage_key" in item));
  assert.ok(!("file_url" in item));
  assert.equal(item.expiry_date, PAST);
  assert.equal(item.is_current, true);
  assert.deepEqual(res.payload.withheld_fields, ["storage_key", "file_url", "declared_reference", "document_number"]);
});

test("EXT-07 lista vazia informa denominador e ausência distinta de zero", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request(), res);
  assert.equal(res.payload.denominator, 0);
  assert.equal(res.payload.absence_is_not_zero, true);
  assert.match(res.payload.absence_note, /nao ausencia de obrigacao ou de risco/);
});

// ---------------------------------------------------------------------------
// Idempotência, concorrência e auditoria
// ---------------------------------------------------------------------------
test("EXT-07 retry idêntico devolve replay sem segunda escrita", async () => {
  const world = scenario();
  const first = responseCapture();
  const client = api(world.pool);
  await client.handle(request({ method: "POST", body: validObligation }), first);
  assert.equal(first.status, 201);
  const second = responseCapture();
  await client.handle(request({ method: "POST", body: validObligation }), second);
  assert.equal(second.status, 200);
  assert.equal(second.payload.replayed, true);
  assert.equal(insertsInto(world.statements, "ext_compliance_obligations").length, 1);
  assert.equal(insertsInto(world.statements, "ext_compliance_events").length, 1);
});

test("EXT-07 mesma chave com corpo divergente devolve 409", async () => {
  const world = scenario();
  const client = api(world.pool);
  await client.handle(request({ method: "POST", body: validObligation }), responseCapture());
  const res = responseCapture();
  await client.handle(request({
    method: "POST", body: { ...validObligation, title: "Titulo divergente sintetico" },
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "idempotency_key_reused_with_different_payload");
  assert.equal(insertsInto(world.statements, "ext_compliance_obligations").length, 1);
});

test("EXT-07 serializa a mesma chave com lock antes de ler o replay", async () => {
  const world = scenario();
  await api(world.pool).handle(request({ method: "POST", body: validObligation }), responseCapture());
  const order = world.statements.map(entry => normalize(entry.sql));
  const begin = order.findIndex(sql => sql === "BEGIN");
  const lock = order.findIndex(sql => sql.includes("pg_advisory_xact_lock"));
  const replay = order.findIndex(sql => sql.includes("FROM ext_compliance_events WHERE created_by_identity = $1"));
  const insert = order.findIndex(sql => /INSERT INTO ext_compliance_obligations\b/.test(sql));
  const event = order.findIndex(sql => /INSERT INTO ext_compliance_events\b/.test(sql));
  const audit = order.findIndex(sql => /INSERT INTO audit_log\b/.test(sql));
  const commit = order.findIndex(sql => sql === "COMMIT");
  assert.ok(begin >= 0 && begin < lock, "BEGIN precede o lock");
  assert.ok(lock < replay, "lock precede a leitura de replay");
  assert.ok(replay < insert && insert < event && event < audit && audit < commit,
    "ordem canônica: replay -> entidade -> evento -> auditoria -> commit");
});

test("EXT-07 falha de audit_log faz rollback e devolve 503", async () => {
  const world = scenario({ failAudit: true });
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", body: validObligation }), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_log_unavailable");
  assert.ok(ran(world.statements, "ROLLBACK"), "a transação precisa ser desfeita");
  assert.ok(!ran(world.statements, "COMMIT"), "nada pode ser confirmado sem auditoria");
});

test("EXT-07 identidade de sessão revogada na transação devolve 403", async () => {
  const world = scenario();
  const res = responseCapture();
  world.pool.connect = async () => ({
    async query(raw, params = []) {
      world.statements.push({ sql: raw, params });
      const sql = normalize(raw);
      if (sql.includes("FROM auth_identities i JOIN auth_staff_profiles p")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  });
  await api(world.pool).handle(request({ method: "POST", body: validObligation }), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "staff_identity_not_authorized");
  assert.equal(insertsInto(world.statements, "ext_compliance_obligations").length, 0);
});

// ---------------------------------------------------------------------------
// Avaliação temporal e tarefa
// ---------------------------------------------------------------------------
const expiringDocument = {
  id: documentId, obligation_id: obligationId, status: "vigente", expiry_date: PAST,
  effective_start_date: OLDER, issue_date: OLDER, validity_rule: "anual_com_renovacao_declarada",
  renewal_lead_days: 30, obligation_responsible: identityId, obligation_title: "Licenca sintetica",
};

test("EXT-07 avaliação recusa data-base vinda do cliente", async () => {
  const world = scenario({ documentsToEvaluate: [expiringDocument] });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/evaluate", body: { evaluation_date: "1999-01-01" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "server_owned_field_rejected");
  assert.ok(res.payload.fields.includes("evaluation_date"));
});

test("EXT-07 vencimento gera tarefa com regra, data-base e fatos (CRITÉRIO DO PLANO)", async () => {
  const world = scenario({ documentsToEvaluate: [expiringDocument] });
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {} }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.tasks_created, 1);
  assert.equal(res.payload.rule, EXPIRY_TASK_RULE);
  assert.equal(res.payload.base_date, TODAY);
  const [insert] = insertsInto(world.statements, "ext_compliance_tasks");
  assert.ok(insert, "a tarefa precisa nascer de INSERT INTO ext_compliance_tasks");
  assert.equal(insert.params[2], `${OLDER}:${PAST}`);
  assert.equal(insert.params[3], EXPIRY_TASK_RULE);
  assert.equal(insert.params[4], TODAY);
  assert.equal(insert.params[5], PAST);
  const facts = JSON.parse(insert.params[6]);
  assert.equal(facts.base_date, TODAY);
  assert.equal(facts.expiry_date, PAST);
  assert.equal(facts.base_date_source, "postgres_current_date");
  assert.ok(facts.days_overdue > 0);
  assert.equal(insert.params[7], identityId, "responsável canônico da obrigação");
});

test("EXT-07 tarefa nasce na MESMA transação da avaliação, antes do commit", async () => {
  const world = scenario({ documentsToEvaluate: [expiringDocument] });
  await api(world.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {} }), responseCapture());
  const order = world.statements.map(entry => normalize(entry.sql));
  const task = order.findIndex(sql => /INSERT INTO ext_compliance_tasks\b/.test(sql));
  const audit = order.findIndex(sql => /INSERT INTO audit_log\b/.test(sql));
  const commit = order.findIndex(sql => sql === "COMMIT");
  assert.ok(task >= 0 && task < audit && audit < commit);
});

test("EXT-07 avaliação sem responsável ativo falha fechada e não cria tarefa", async () => {
  // Documento recém-declarado cujo responsável NÃO é a identidade da sessão.
  const orphan = { ...expiringDocument, obligation_responsible: otherIdentityId };
  const world = scenario({ documentsToEvaluate: [orphan], responsibleActive: false });
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {} }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "responsible_staff_missing");
  assert.equal(res.payload.fail_closed, true);
  assert.equal(insertsInto(world.statements, "ext_compliance_tasks").length, 0);
  assert.ok(ran(world.statements, "ROLLBACK"));
});

test("EXT-07 reavaliação não duplica tarefa do mesmo período e regra", async () => {
  const world = scenario({ documentsToEvaluate: [expiringDocument], taskInsertConflict: true });
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {} }), res);
  assert.equal(res.payload.tasks_created, 0);
  assert.equal(res.payload.tasks_already_present, 1);
  const [insert] = insertsInto(world.statements, "ext_compliance_tasks");
  assert.match(normalize(insert.sql), /ON CONFLICT \(document_id, validity_period, rule\) DO NOTHING/);
});

test("EXT-07 documento ainda válido não gera tarefa e informa denominador", async () => {
  const world = scenario({ documentsToEvaluate: [{ ...expiringDocument, expiry_date: FUTURE }] });
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {} }), res);
  assert.equal(res.payload.tasks_created, 0);
  assert.equal(res.payload.expired, 0);
  assert.equal(res.payload.denominator, 1);
  assert.equal(res.payload.absence_is_not_zero, false);
  assert.equal(insertsInto(world.statements, "ext_compliance_tasks").length, 0);
});

test("EXT-07 avaliação sem documento algum distingue ausência de zero", async () => {
  const world = scenario({ documentsToEvaluate: [] });
  const res = responseCapture();
  await api(world.pool).handle(request({ method: "POST", url: "/api/ext/compliance/evaluate", body: {} }), res);
  assert.equal(res.payload.denominator, 0);
  assert.equal(res.payload.absence_is_not_zero, true);
  assert.match(res.payload.absence_note, /nao conformidade comprovada/);
});

// ---------------------------------------------------------------------------
// Máquina de estados da tarefa
// ---------------------------------------------------------------------------
const openTask = {
  id: taskId, obligation_id: obligationId, document_id: documentId, status: "aberta",
  responsible_identity: identityId, validity_period: `${OLDER}:${PAST}`, rule: EXPIRY_TASK_RULE,
  evaluation_date: TODAY, due_date: PAST, facts: {},
};

test("EXT-07 conclusão sem resultado é recusada", async () => {
  const world = scenario({ taskRow: openTask });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/tasks/${taskId}/complete`, body: {},
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "completion_result_required");
});

test("EXT-07 conclusão exige responsável canônico ainda ativo", async () => {
  // Tarefa recém-declarada cujo responsável não é a identidade da sessão.
  const world = scenario({ taskRow: { ...openTask, responsible_identity: otherIdentityId }, responsibleActive: false });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/tasks/${taskId}/complete`,
    body: { result: "Resultado sintetico suficiente." },
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "completion_requires_active_responsible");
  assert.equal(res.payload.fail_closed, true);
});

test("EXT-07 conclusão válida registra autoria da sessão", async () => {
  const world = scenario({ taskRow: openTask });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/tasks/${taskId}/complete`,
    body: { result: "Renovacao sintetica protocolada internamente." },
  }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.task.status, "concluida");
  assert.equal(res.payload.transition.author_identity, identityId);
  assert.equal(res.payload.transition.author_source, "sessao_staff");
});

test("EXT-07 cancelamento exige justificativa", async () => {
  const world = scenario({ taskRow: openTask });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/tasks/${taskId}/cancel`, body: { justification: "curto" },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "cancellation_justification_required");
});

test("EXT-07 tarefa terminal não reabre", async () => {
  for (const status of ["concluida", "cancelada"]) {
    const world = scenario({ taskRow: { ...openTask, status } });
    const res = responseCapture();
    await api(world.pool).handle(request({
      method: "POST", url: `/api/ext/compliance/tasks/${taskId}/start`, body: {},
    }), res);
    assert.equal(res.status, 409);
    assert.equal(res.payload.error, "terminal_task_cannot_reopen");
  }
});

test("EXT-07 transição inválida de tarefa em andamento devolve 409", async () => {
  const world = scenario({ taskRow: { ...openTask, status: "em_andamento" } });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/tasks/${taskId}/start`, body: {},
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "invalid_transition");
});

test("EXT-07 recusa UUID inválido em rota de tarefa", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: "/api/ext/compliance/tasks/nao-e-uuid/start", body: {},
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_task_id");
});

// ---------------------------------------------------------------------------
// Renovação e versionamento
// ---------------------------------------------------------------------------
const currentDocument = {
  id: documentId, obligation_id: obligationId, status: "vencida", version_no: 1,
  expiry_date: PAST, issue_date: OLDER, effective_start_date: OLDER, superseded_by: null,
  title: "Documento sintetico EXT-07", description: "Referencia documental sintetica declarada.",
  compliance_type: "licenca", document_number: "ABC-987654321", issuer: "Orgao Sintetico Invalid",
  reference_type: "referencia_declarada", declared_reference: "REF-SINTETICA-0001",
  reference_source: "registro interno sintetico",
};
const renewalBody = { issue_date: TODAY, expiry_date: FUTURE, renewal_justification: "Renovacao sintetica declarada pela equipe." };

test("EXT-07 renovação exige justificativa", async () => {
  const world = scenario({ documentRow: currentDocument });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`,
    body: { issue_date: TODAY, expiry_date: FUTURE },
  }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "renewal_justification_required");
});

test("EXT-07 renovação cria registro novo e preserva a versão anterior", async () => {
  const world = scenario({ documentRow: currentDocument });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`, body: renewalBody,
  }), res);
  assert.equal(res.status, 201);
  assert.equal(res.payload.document.version_no, 2);
  assert.equal(res.payload.document.replacement_of, documentId);
  assert.equal(res.payload.previous_version.id, documentId);
  assert.equal(res.payload.previous_version.preserved, true);
  assert.equal(res.payload.previous_version.expiry_date, PAST);
  // O registro anterior só recebe a marca de substituição; nada é sobrescrito.
  const order = world.statements.map(entry => normalize(entry.sql));
  const supersedeAt = order.findIndex(sql => sql.includes("UPDATE ext_compliance_documents SET superseded_by"));
  const insertAt = order.findIndex(sql => /INSERT INTO ext_compliance_documents\b/.test(sql));
  assert.ok(supersedeAt >= 0 && supersedeAt < insertAt,
    "a substituição é gravada antes da nova versão, senão as duas seriam atuais ao mesmo tempo");
  const supersede = world.statements[supersedeAt];
  assert.equal(supersede.params[0], documentId);
  assert.equal(supersede.params[1], res.payload.document.id, "aponta exatamente para a nova versão");
  assert.equal(supersede.params[2], identityId);
  assert.equal(insertsInto(world.statements, "ext_compliance_documents").length, 1);
});

test("EXT-07 renovação que não avança a validade é recusada", async () => {
  const world = scenario({ documentRow: currentDocument });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`,
    body: { ...renewalBody, issue_date: OLDER, expiry_date: PAST },
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "renewal_must_extend_validity");
  assert.equal(res.payload.previous_expiry_date, PAST);
});

test("EXT-07 documento já substituído não renova de novo", async () => {
  const world = scenario({ documentRow: { ...currentDocument, superseded_by: renewalId } });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`, body: renewalBody,
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "document_already_superseded");
});

test("EXT-07 documento cancelado não renova", async () => {
  const world = scenario({ documentRow: { ...currentDocument, status: "cancelada" } });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/documents/${documentId}/renew`, body: renewalBody,
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "terminal_document_cannot_renew");
});

// ---------------------------------------------------------------------------
// Roteamento: nenhuma rota pública, nenhum método tolerado por engano
// ---------------------------------------------------------------------------
test("EXT-07 recusa PATCH arbitrário em documentos", async () => {
  const world = scenario();
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "PATCH", url: "/api/ext/compliance/documents", body: { status: "vigente" },
  }), res);
  assert.equal(res.status, 405);
  assert.deepEqual(res.payload.allowed, ["GET", "POST"]);
});

test("EXT-07 rota desconhecida devolve 404 só depois de autorizar", async () => {
  const world = scenario();
  const anonymous = responseCapture();
  await api(world.pool, { session: null }).handle(request({ url: "/api/ext/compliance/inventado" }), anonymous);
  assert.equal(anonymous.status, 401, "rota inexistente não pode virar enumerador para anônimo");
  const authorized = responseCapture();
  await api(world.pool).handle(request({ url: "/api/ext/compliance/inventado" }), authorized);
  assert.equal(authorized.status, 404);
});

test("EXT-07 ação de tarefa fora do catálogo não vira transição", async () => {
  const world = scenario({ taskRow: openTask });
  const res = responseCapture();
  await api(world.pool).handle(request({
    method: "POST", url: `/api/ext/compliance/tasks/${taskId}/aprovar`, body: {},
  }), res);
  assert.equal(res.status, 404);
  assert.deepEqual(res.payload.allowed_actions, ["start", "complete", "cancel"]);
  assert.equal(world.statements.length, 0);
});

// ---------------------------------------------------------------------------
// Contrato das migrações 153 e 154
// ---------------------------------------------------------------------------
const readMigration = name => readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8");

test("EXT-07 mantém ext_compliance_documents como fonte canônica e preserva legado", async () => {
  const sql = await readMigration("153-ext07-compliance-journey.sql");
  assert.match(sql, /origin TEXT NOT NULL DEFAULT 'registro_legado'/);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS ext_compliance_documents/);
  const hardening = await readMigration("154-ext07-compliance-hardening.sql");
  assert.doesNotMatch(hardening, /CREATE TABLE/, "a 154 é aditiva: nenhuma tabela paralela");
  assert.doesNotMatch(hardening, /INSERT INTO/, "a 154 não semeia dado algum");
});

test("EXT-07 migração 154 impõe privacidade e proíbe arquivo na linha canônica", async () => {
  const sql = await readMigration("154-ext07-compliance-hardening.sql");
  assert.match(sql, /ext_compliance_canonical_private/);
  assert.match(sql, /ext_compliance_canonical_reference_only/);
  assert.match(sql, /storage_key IS NULL AND file_url IS NULL/);
});

test("EXT-07 migração 154 reforça versionamento, supersessão e ausência de ciclo", async () => {
  const sql = await readMigration("154-ext07-compliance-hardening.sql");
  assert.match(sql, /ext_compliance_no_self_replacement/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /ext_compliance_no_self_supersede/);
  assert.match(sql, /compliance renewal chain cannot form a cycle/);
  assert.match(sql, /superseded_by IS NULL\s*\n?\s*AND status <> 'cancelada'::ext_compliance_status/);
  assert.match(sql, /canonical compliance document is immutable; create a renewal/);
});

test("EXT-07 migração 154 deixa a tarefa fail-closed e imutável na origem", async () => {
  const sql = await readMigration("154-ext07-compliance-hardening.sql");
  assert.match(sql, /ext_compliance_tasks_responsible_required/);
  assert.match(sql, /compliance task provenance is immutable/);
  assert.match(sql, /invalid compliance task transition/);
  assert.match(sql, /compliance task history is immutable/);
});

test("EXT-07 migração 154 usa ::text em comparação enum/TEXT e NOT VALID", async () => {
  const sql = await readMigration("154-ext07-compliance-hardening.sql");
  assert.match(sql, /origin::text <> ''ext07_canonica''/);
  assert.match(sql, /OLD\.status::text = 'cancelada'/);
  assert.match(sql, /NOT VALID/);
});

test("EXT-07 migração 154 impede estado vigente com validade vencida", async () => {
  const sql = await readMigration("154-ext07-compliance-hardening.sql");
  assert.match(sql, /compliance document cannot be vigente with expired validity/);
  assert.match(sql, /CURRENT_DATE/);
});

test("EXT-07 rota canônica está no allowlist do servidor", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  // Sem o prefixo no API_PATH_MATCH a jornada inteira vira 404 do Next.
  assert.match(server, /\|\| pathname\.startsWith\("\/api\/ext\/compliance\/"\)/);
  assert.match(server, /url\.pathname\.startsWith\("\/api\/ext\/compliance\/"\)\) return extComplianceApi\.handle/);
});

test("EXT-07 preserva rotas legadas exatas e handlers EXT-08..12", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  for (const legacy of [
    "/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents",
    "/api/hr/ext-compliance-documents", "/api/ext/compliance-documents",
  ]) {
    assert.ok(server.includes(legacy), `rota legada ${legacy} precisa continuar existindo`);
  }
  assert.match(server, /legacy_writer_retired/);
  const advanced = await readFile(new URL("../src/server/ext-advanced-api.mjs", import.meta.url), "utf8");
  for (const handler of [
    "handleComplianceDocuments", "handleKnowledgeBase", "handleExpansionPlans",
    "handleExpansionScenarios", "handleContinuityPlans", "handleAnalyticsExperiments",
    "handleVisualTokens", "handleVisualLayouts",
  ]) {
    assert.ok(advanced.includes(handler), `handler ${handler} não pode ser removido`);
  }
});
