import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createExtThirdPartyApi,
  deriveGrantWindow,
  deriveAccessSituation,
  deriveAccessDecision,
  deriveDocumentExpiry,
  EXTERNAL_ACTOR_BOUNDARY,
  THIRD_PARTY_SOURCES,
  CONTRACT_STATUSES_NOT_GRANTABLE,
  SERVICE_ORDER_STATUSES_NOT_GRANTABLE,
} from "../src/server/ext-third-party-api.mjs";

const identityId = "22222222-2222-4222-8222-222222222222";
const thirdPartyId = "11111111-1111-4111-8111-111111111111";
const contractId = "44444444-4444-4444-8444-444444444444";
const otherContractId = "55555555-5555-4555-8555-555555555555";
const serviceOrderId = "66666666-6666-4666-8666-666666666666";
const grantId = "77777777-7777-4777-8777-777777777777";
const documentId = "88888888-8888-4888-8888-888888888888";
const forged = "99999999-9999-4999-8999-999999999999";

const partyRow = {
  id: thirdPartyId, name: "Terceiro Sintético Ltda", document: "00.000.000/0001-00",
  category: "manutencao", status: "ativo", contract_id: contractId,
  contract_verified_at: "2026-09-01T00:00:00.000Z", contract_verified_status: "ativo",
  responsible_name: "Responsável Sintético", evaluation_score: null, evaluation_source_id: null,
  notes: null, origin: "jornada_terceiros", created_by_identity: identityId,
  created_at: "now", updated_at: "now",
};

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = "/api/ext/third-party/parties", body, key = "ext02-test-key-0001" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "admin.test", origin: "https://admin.test" };
  if (key !== null) headers["idempotency-key"] = key;
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}

function api(pool, { session = { identityId, role: "admin" }, origin = true } = {}) {
  return createExtThirdPartyApi({
    pool,
    sameOrigin: () => origin,
    requireSession: async () => session,
  });
}

function readPool(routes = []) {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      for (const [needle, rows] of routes) {
        if (sql.includes(needle)) return { rows };
      }
      return { rows: [] };
    },
  };
  return { statements, pool };
}

function mutationPool({
  replayRow = null,
  party = partyRow,
  failAudit = false,
  contract = { id: contractId, title: "Contrato Sintético", status: "ativo" },
  serviceOrder = { id: serviceOrderId, protocol: "OS-AST-20260101-AB12", status: "aberta", contract_id: contractId },
  grant = null,
  document = null,
  liveGrant = null,
} = {}) {
  const statements = [];
  const client = {
    async query(rawSql, params) {
      statements.push({ sql: rawSql, params });
      // O SQL real é multilinha; o mock casa sobre a forma normalizada.
      const sql = String(rawSql).replace(/\s+/g, " ");
      if (sql.includes("INSERT INTO audit_log")) {
        if (failAudit) throw new Error("audit offline");
      }
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: replayRow ? [replayRow] : [] };
      if (sql.includes("FROM ext_third_parties WHERE id=$1 FOR UPDATE")) return { rows: party ? [{ ...party }] : [] };
      if (sql.includes("SELECT id FROM ext_third_parties WHERE id=$1 FOR UPDATE")) return { rows: party ? [{ id: party.id }] : [] };
      if (sql.includes("SELECT * FROM ext_third_parties WHERE id=$1")) return { rows: party ? [{ ...party }] : [] };
      if (sql.includes("FROM crm_contracts WHERE id=$1")) return { rows: contract ? [{ ...contract }] : [] };
      if (sql.includes("FROM ast_service_orders WHERE id=$1")) return { rows: serviceOrder ? [{ ...serviceOrder }] : [] };
      if (sql.includes("SELECT id FROM ext_third_party_access_grants WHERE third_party_id=$1 AND revoked_at IS NULL")) {
        return { rows: liveGrant ? [liveGrant] : [] };
      }
      if (sql.includes("SELECT * FROM ext_third_party_access_grants WHERE id=$1 FOR UPDATE")) return { rows: grant ? [{ ...grant }] : [] };
      if (sql.includes("SELECT * FROM ext_third_party_documents WHERE id=$1 FOR UPDATE")) return { rows: document ? [{ ...document }] : [] };
      if (sql.includes("INSERT INTO ext_third_parties (")) {
        return { rows: [{ ...partyRow, id: params[0], name: params[1], document: params[2], category: params[3], responsible_name: params[4], notes: params[5], created_by_identity: params[6] }] };
      }
      if (sql.includes("INSERT INTO ext_third_party_access_grants (")) {
        return { rows: [{ id: grantId, third_party_id: params[0], scope_kind: params[1], contract_id: params[2], service_order_id: params[3], access_start: params[4], access_end: params[5], justification: params[6], granted_by_identity: params[7], revoked_at: null }] };
      }
      if (sql.includes("INSERT INTO ext_third_party_evaluations (")) {
        return { rows: [{ id: "eval-1", third_party_id: params[0], score: params[1], justification: params[2], evaluated_on: params[3], evaluated_by_identity: params[4] }] };
      }
      if (sql.includes("INSERT INTO ext_third_party_documents (")) {
        return { rows: [{ id: documentId, third_party_id: params[0], document_type: params[1], document_number: params[2], file_name: params[3], expiry_date: params[4], is_active: true, created_by_identity: params[5] }] };
      }
      if (sql.includes("INSERT INTO ext_third_party_document_rules (")) {
        return { rows: [{ id: "rule-1", third_party_id: params[0], alert_before_days: params[1], justification: params[2], is_active: true }] };
      }
      if (sql.includes("UPDATE ext_third_party_access_grants")) {
        return { rows: [{ ...(grant || {}), id: params[0], revoked_at: "2026-10-03T00:00:00.000Z", revoke_reason: params[2], access_start: grant?.access_start ?? "2026-01-01", access_end: grant?.access_end ?? "2026-12-31" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE ext_third_party_documents")) {
        return { rows: [{ ...(document || {}), id: params[0], is_active: false, deactivate_reason: params[2] }] };
      }
      if (sql.includes("UPDATE ext_third_parties SET status")) return { rows: [{ ...partyRow, status: params[1] }] };
      if (sql.includes("UPDATE ext_third_parties SET contract_id")) return { rows: [{ ...partyRow, contract_id: params[1], contract_verified_by_identity: params[2], contract_verified_status: params[3] }] };
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

// O SQL de produção é multilinha: a busca compara a forma normalizada, para
// que a assertiva verifique a ORDEM real das instruções e não a formatação.
function sqlIndex(statements, needle) {
  return statements.findIndex(s => String(s.sql).replace(/\s+/g, " ").includes(needle));
}

// ---------------------------------------------------------------------------
// Autorização: anônimo 401, papel não autorizado 403, antes de qualquer query.
// ---------------------------------------------------------------------------

test("EXT-02: anônimo recebe 401 sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool, { session: null }).handleParties(request({}), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "unauthorized");
  assert.equal(statements.length, 0);
});

test("EXT-02: papel staff não autorizado (rh) recebe 403 — e não o 401 indistinto do handler legado", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool, { session: { identityId, role: "rh" } }).handleParties(request({}), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "forbidden_role");
  assert.equal(statements.length, 0);
});

test("EXT-02: papel não autorizado recebe 403 em toda rota derivada e de mutação, sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const handler = api(pool, { session: { identityId, role: "rh" } });
  const routes = [
    ["handlePartyById", "GET", thirdPartyId, undefined],
    ["handlePartyById", "PATCH", thirdPartyId, { status: "encerrado", reason: "motivo suficiente" }],
    ["handlePartyAuthorization", "GET", thirdPartyId, undefined],
    ["handlePartyAccessGrants", "GET", thirdPartyId, undefined],
    ["handlePartyAccessGrants", "POST", thirdPartyId, { scope_kind: "contrato", scope_id: contractId }],
    ["handlePartyContract", "POST", thirdPartyId, { contract_id: contractId }],
    ["handlePartyDocuments", "GET", thirdPartyId, undefined],
    ["handlePartyDocuments", "POST", thirdPartyId, { document_type: "CNPJ" }],
    ["handlePartyDocumentRules", "POST", thirdPartyId, { alert_before_days: 30 }],
    ["handlePartyEvaluations", "POST", thirdPartyId, { score: 8 }],
    ["handleAccessGrantRevoke", "POST", grantId, { reason: "motivo suficiente" }],
    ["handleDocumentDeactivate", "POST", documentId, { reason: "motivo suficiente" }],
  ];
  for (const [fn, method, id, body] of routes) {
    const res = responseCapture();
    const url = `/api/ext/third-party/parties/${thirdPartyId}/authorization?scope_kind=contrato&scope_id=${contractId}`;
    await handler[fn](request({ method, url, body }), res, id);
    assert.equal(res.status, 403, `${fn} ${method} deve negar por papel`);
    assert.equal(res.payload.error, "forbidden_role");
  }
  assert.equal(statements.length, 0, "nenhuma consulta é feita antes da negação por papel");
});

test("EXT-02: mutação exige same-origin antes de qualquer query", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool, { origin: false }).handleParties(request({ method: "POST", body: { name: "Terceiro Sintético Ltda" } }), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "origin_forbidden");
  assert.equal(statements.length, 0);
});

// ---------------------------------------------------------------------------
// Ausência declarada, com escopo, fonte e data-base. Nada inventado.
// ---------------------------------------------------------------------------

test("EXT-02: sem registro canônico, a listagem declara a ausência com escopo, fonte e data-base", async () => {
  const { pool } = readPool([["FROM ext_third_parties tp", []]]);
  const res = responseCapture();
  await api(pool).handleParties(request({}), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.third_parties_registered, false);
  assert.deepEqual(res.payload.third_parties, []);
  assert.ok(res.payload.source.includes(THIRD_PARTY_SOURCES.parties));
  assert.ok(res.payload.base_date, "data-base declarada");
  assert.equal(res.payload.scope.kind, "staff_autorizado");
  assert.match(res.payload.note, /Nenhum terceiro registrado no backend canônico/);
  assert.match(res.payload.note, /Nenhum cadastro, janela ou avaliação é inventado/);
});

test("EXT-02: a listagem declara a fronteira externa pendente e nunca inventa canal de terceiro", async () => {
  const { pool } = readPool([["FROM ext_third_parties tp", [partyRow]]]);
  const res = responseCapture();
  await api(pool).handleParties(request({}), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.external_actor_boundary.authenticated_third_party_channel, false);
  assert.equal(res.payload.external_actor_boundary.status, "pendente");
  assert.match(res.payload.external_actor_boundary.note, /Não existe hoje ator externo 'terceiro' autenticado/);
  // Nenhuma sessão de terceiro é inventada: só as canônicas já existentes.
  assert.deepEqual(
    EXTERNAL_ACTOR_BOUNDARY.canonical_sessions_today,
    ["auth_staff_sessions (staff)", "auth_sessions (cliente)", "auth_employee_sessions (colaborador)"],
  );
});

test("EXT-02: filtros da listagem são validados no servidor (sem interpolação do navegador)", async () => {
  const { pool } = readPool([["FROM ext_third_parties tp", []]]);
  const handler = api(pool);
  const bad = responseCapture();
  await handler.handleParties(request({ url: "/api/ext/third-party/parties?status=qualquer" }), bad);
  assert.equal(bad.status, 400);
  assert.equal(bad.payload.error, "invalid_status");
  const badContract = responseCapture();
  await handler.handleParties(request({ url: "/api/ext/third-party/parties?contract_id=nao-e-uuid" }), badContract);
  assert.equal(badContract.status, 400);
  assert.equal(badContract.payload.error, "invalid_contract_id");
});

// ---------------------------------------------------------------------------
// Idempotência: chave obrigatória, replay sem duplicar, reuso divergente 409.
// ---------------------------------------------------------------------------

test("EXT-02: POST sem Idempotency-Key responde 400 sem escrever", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleParties(request({ method: "POST", body: { name: "Terceiro Sintético Ltda" }, key: null }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "idempotency_key_required");
  assert.equal(statements.length, 0);
});

test("EXT-02: cadastro é transação única (negócio + evento imutável + audit_log) com autoria da sessão; corpo forjado é ignorado", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handleParties(request({
    method: "POST",
    body: {
      name: "Terceiro Sintético Ltda", document: "00.000.000/0001-00", category: "manutencao",
      // Campos forjados: devem ser ignorados pelo servidor.
      id: forged,
      created_by_identity: forged,
      responsible_identity: forged,
      origin: "registro_legado",
      contract_id: forged,
      access_start: "2020-01-01",
      access_end: "2099-12-31",
      evaluation_score: 10,
      status: "ativo",
    },
  }), res);
  assert.equal(res.status, 201);

  const begin = sqlIndex(statements, "BEGIN");
  const insertParty = sqlIndex(statements, "INSERT INTO ext_third_parties");
  const insertEvent = sqlIndex(statements, "INSERT INTO ext_third_party_events");
  const insertAudit = sqlIndex(statements, "INSERT INTO audit_log");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(begin >= 0 && begin < insertParty && insertParty < insertEvent && insertEvent < insertAudit && insertAudit < commit,
    "ordem: BEGIN → terceiro → evento → auditoria → COMMIT");

  const insertSql = statements[insertParty].sql;
  const partyParams = statements[insertParty].params;
  assert.notEqual(partyParams[0], forged, "ID gerado no servidor, não do corpo");
  assert.equal(partyParams[6], identityId, "autoria derivada da sessão, não do corpo");
  assert.ok(insertSql.includes("'jornada_terceiros'"), "origem fixada pelo servidor");
  // O INSERT do cadastro não aceita contrato, janela nem nota vindos do corpo.
  assert.ok(!insertSql.includes("contract_id"), "contrato não é vinculado pelo cadastro");
  assert.ok(!insertSql.includes("access_start") && !insertSql.includes("access_end"), "janela não nasce de campo livre no cadastro");
  assert.ok(!insertSql.includes("evaluation_score"), "nota não é aceita no cadastro");
  assert.ok(!insertSql.includes("status"), "situação não é aceita do corpo no cadastro");
  assert.equal(statements[insertAudit].params[0], "ext_third_party_create");
  assert.equal(statements[insertAudit].params[1], identityId);
});

test("EXT-02: retry idêntico não duplica — replay devolve o mesmo terceiro", async () => {
  const body = { name: "Terceiro Sintético Ltda" };
  const first = mutationPool();
  await api(first.pool).handleParties(request({ method: "POST", body }), responseCapture());
  const eventInsert = first.statements[sqlIndex(first.statements, "INSERT INTO ext_third_party_events")];
  const storedFingerprint = eventInsert.params[5];
  assert.match(String(storedFingerprint), /^[0-9a-f]{64}$/);

  const replay = mutationPool({ replayRow: { third_party_id: thirdPartyId, request_fingerprint: storedFingerprint, payload: {} } });
  const res = responseCapture();
  await api(replay.pool).handleParties(request({ method: "POST", body }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.payload.third_party.id, thirdPartyId);
  assert.equal(sqlIndex(replay.statements, "INSERT INTO ext_third_parties"), -1, "nenhuma segunda criação");
  assert.equal(sqlIndex(replay.statements, "INSERT INTO audit_log"), -1, "replay não regrava auditoria");
});

test("EXT-02: reuso da chave com conteúdo divergente responde 409 e reverte", async () => {
  const { statements, pool } = mutationPool({ replayRow: { third_party_id: thirdPartyId, request_fingerprint: "a".repeat(64), payload: {} } });
  const res = responseCapture();
  await api(pool).handleParties(request({ method: "POST", body: { name: "Outro Terceiro Divergente" } }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "idempotency_key_reused");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "INSERT INTO ext_third_parties"), -1);
});

test("EXT-02: retry idêntico da janela de acesso não cria segunda janela", async () => {
  const body = { scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." };
  const first = mutationPool();
  await api(first.pool).handlePartyAccessGrants(request({ method: "POST", body }), responseCapture(), thirdPartyId);
  const fingerprint = first.statements[sqlIndex(first.statements, "INSERT INTO ext_third_party_events")].params[5];

  const replay = mutationPool({ replayRow: { third_party_id: thirdPartyId, request_fingerprint: fingerprint, payload: { record_id: grantId } } });
  const res = responseCapture();
  await api(replay.pool).handlePartyAccessGrants(request({ method: "POST", body }), res, thirdPartyId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);
  assert.equal(sqlIndex(replay.statements, "INSERT INTO ext_third_party_access_grants"), -1, "nenhuma segunda janela");
});

// ---------------------------------------------------------------------------
// Auditoria obrigatória: indisponível → 503 com rollback, nada persiste.
// ---------------------------------------------------------------------------

test("EXT-02: falha da auditoria devolve 503 audit_unavailable com rollback (sem COMMIT)", async () => {
  const { statements, pool } = mutationPool({ failAudit: true });
  const res = responseCapture();
  await api(pool).handleParties(request({ method: "POST", body: { name: "Terceiro Sintético Ltda" } }), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_unavailable");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0, "rollback emitido");
  assert.equal(sqlIndex(statements, "COMMIT"), -1, "nenhum COMMIT após falha da auditoria");
});

test("EXT-02: falha da auditoria também reverte a concessão de acesso (nenhuma janela sem trilha)", async () => {
  const { statements, pool } = mutationPool({ failAudit: true });
  const res = responseCapture();
  await api(pool).handlePartyAccessGrants(request({
    method: "POST",
    body: { scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." },
  }), res, thirdPartyId);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_unavailable");
  assert.ok(sqlIndex(statements, "INSERT INTO ext_third_party_access_grants") >= 0, "a janela chegou a ser tentada");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0, "mas foi revertida");
  assert.equal(sqlIndex(statements, "COMMIT"), -1);
});

// ---------------------------------------------------------------------------
// Contrato: vínculo só após validação canônica no servidor.
// ---------------------------------------------------------------------------

test("EXT-02: vínculo de contrato inexistente é recusado com 404 e rollback — o corpo não vincula", async () => {
  const { statements, pool } = mutationPool({ contract: null });
  const res = responseCapture();
  await api(pool).handlePartyContract(request({ method: "POST", body: { contract_id: forged, justification: "Vínculo sintético" } }), res, thirdPartyId);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, "contract_not_found");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "UPDATE ext_third_parties SET contract_id"), -1, "nada gravado sem validação canônica");
});

test("EXT-02: vínculo aceito registra quem verificou, quando e a situação canônica observada", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handlePartyContract(request({
    method: "POST",
    body: { contract_id: contractId, justification: "Contrato de manutenção sintético", contract_verified_by_identity: forged },
  }), res, thirdPartyId);
  assert.equal(res.status, 201);
  const lookup = sqlIndex(statements, "FROM crm_contracts WHERE id=$1");
  const update = sqlIndex(statements, "UPDATE ext_third_parties SET contract_id");
  assert.ok(lookup >= 0 && lookup < update, "a validação canônica vem antes da gravação");
  const params = statements[update].params;
  assert.equal(params[1], contractId);
  assert.equal(params[2], identityId, "verificador derivado da sessão, não do corpo");
  assert.equal(params[3], "ativo", "situação observada registrada como fato");
  assert.ok(statements[update].sql.includes("contract_verified_at=NOW()"));
});

test("EXT-02: trocar de contrato com janela viva é recusado (409) para não deixar acesso órfão", async () => {
  const { statements, pool } = mutationPool({
    party: { ...partyRow, contract_id: otherContractId },
    liveGrant: { id: grantId },
  });
  const res = responseCapture();
  await api(pool).handlePartyContract(request({ method: "POST", body: { contract_id: contractId, justification: "Troca sintética" } }), res, thirdPartyId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "contract_rebind_blocked_by_active_grant");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "UPDATE ext_third_parties SET contract_id"), -1);
});

// ---------------------------------------------------------------------------
// "Acessa só OS/contrato autorizado": escopo imposto na concessão.
// ---------------------------------------------------------------------------

test("EXT-02: conceder acesso a contrato não vinculado canonicamente é recusado (409)", async () => {
  const { statements, pool } = mutationPool({ party: { ...partyRow, contract_id: otherContractId } });
  const res = responseCapture();
  await api(pool).handlePartyAccessGrants(request({
    method: "POST",
    body: { scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." },
  }), res, thirdPartyId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "contract_not_bound_to_third_party");
  assert.equal(sqlIndex(statements, "INSERT INTO ext_third_party_access_grants"), -1);
});

test("EXT-02: contrato cancelado/encerrado não autoriza acesso novo — bloqueio declarado", async () => {
  for (const status of CONTRACT_STATUSES_NOT_GRANTABLE) {
    const { statements, pool } = mutationPool({ contract: { id: contractId, title: "Contrato Sintético", status } });
    const res = responseCapture();
    await api(pool).handlePartyAccessGrants(request({
      method: "POST",
      body: { scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." },
    }), res, thirdPartyId);
    assert.equal(res.status, 409, `status ${status} deve bloquear`);
    assert.equal(res.payload.error, "contract_not_grantable");
    assert.equal(res.payload.contract_status, status);
    assert.deepEqual(res.payload.blocking_statuses, CONTRACT_STATUSES_NOT_GRANTABLE);
    assert.equal(sqlIndex(statements, "INSERT INTO ext_third_party_access_grants"), -1);
  }
});

test("EXT-02: OS fora do contrato vinculado não gera janela de acesso", async () => {
  const { statements, pool } = mutationPool({
    serviceOrder: { id: serviceOrderId, protocol: "OS-AST-20260101-AB12", status: "aberta", contract_id: otherContractId },
  });
  const res = responseCapture();
  await api(pool).handlePartyAccessGrants(request({
    method: "POST",
    body: { scope_kind: "ordem_servico", scope_id: serviceOrderId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para execução de OS." },
  }), res, thirdPartyId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "service_order_outside_contract");
  assert.equal(sqlIndex(statements, "INSERT INTO ext_third_party_access_grants"), -1);
});

test("EXT-02: OS cancelada/concluída não autoriza acesso novo — bloqueio declarado", async () => {
  for (const status of SERVICE_ORDER_STATUSES_NOT_GRANTABLE) {
    const { pool } = mutationPool({ serviceOrder: { id: serviceOrderId, protocol: "OS-AST-20260101-AB12", status, contract_id: contractId } });
    const res = responseCapture();
    await api(pool).handlePartyAccessGrants(request({
      method: "POST",
      body: { scope_kind: "ordem_servico", scope_id: serviceOrderId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para execução de OS." },
    }), res, thirdPartyId);
    assert.equal(res.status, 409, `status ${status} deve bloquear`);
    assert.equal(res.payload.error, "service_order_not_grantable");
  }
});

test("EXT-02: terceiro não ativo não recebe janela de acesso", async () => {
  const { statements, pool } = mutationPool({ party: { ...partyRow, status: "suspenso" } });
  const res = responseCapture();
  await api(pool).handlePartyAccessGrants(request({
    method: "POST",
    body: { scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." },
  }), res, thirdPartyId);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "third_party_not_active");
  assert.equal(sqlIndex(statements, "INSERT INTO ext_third_party_access_grants"), -1);
});

test("EXT-02: a janela é gravada com vínculo da URL e autoria da sessão; third_party_id e autor forjados são ignorados", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handlePartyAccessGrants(request({
    method: "POST",
    body: {
      scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31",
      justification: "Acesso sintético para manutenção programada.",
      third_party_id: forged, granted_by_identity: forged, id: forged, revoked_at: null,
    },
  }), res, thirdPartyId);
  assert.equal(res.status, 201);
  const insert = statements[sqlIndex(statements, "INSERT INTO ext_third_party_access_grants")];
  assert.equal(insert.params[0], thirdPartyId, "vínculo derivado da URL");
  assert.equal(insert.params[7], identityId, "autoria derivada da sessão");
  assert.equal(insert.params[2], contractId, "escopo contrato");
  assert.equal(insert.params[3], null, "OS nula no escopo contrato");
});

test("EXT-02: janela sem término, invertida ou já encerrada é recusada antes de qualquer escrita", async () => {
  const cases = [
    [{ scope_kind: "contrato", scope_id: contractId, access_start: "2026-10-01", justification: "Acesso sintético para manutenção programada." }, "invalid_access_end"],
    [{ scope_kind: "contrato", scope_id: contractId, access_start: "2099-10-01", access_end: "2099-01-01", justification: "Acesso sintético para manutenção programada." }, "invalid_access_window"],
    [{ scope_kind: "contrato", scope_id: contractId, access_start: "2020-01-01", access_end: "2020-12-31", justification: "Acesso sintético para manutenção programada." }, "access_window_already_ended"],
    [{ scope_kind: "qualquer", scope_id: contractId, access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." }, "invalid_scope_kind"],
    [{ scope_kind: "contrato", scope_id: "nao-e-uuid", access_start: "2026-10-01", access_end: "2099-12-31", justification: "Acesso sintético para manutenção programada." }, "invalid_scope_id"],
  ];
  for (const [body, expected] of cases) {
    const { statements, pool } = mutationPool();
    const res = responseCapture();
    await api(pool).handlePartyAccessGrants(request({ method: "POST", body }), res, thirdPartyId);
    assert.equal(res.status, 400, `esperado 400 para ${expected}`);
    assert.equal(res.payload.error, expected);
    assert.equal(statements.length, 0, "nenhuma query antes da validação");
  }
});

// ---------------------------------------------------------------------------
// "Perde acesso ao término": derivação determinística, nunca campo livre.
// ---------------------------------------------------------------------------

test("EXT-02: deriveGrantWindow devolve vigente/expirado/nao_iniciado/revogado só das datas e da revogação", async () => {
  const grant = { id: grantId, access_start: "2026-01-01", access_end: "2026-12-31", revoked_at: null };
  assert.equal(deriveGrantWindow(grant, "2026-06-15").status, "vigente");
  assert.equal(deriveGrantWindow(grant, "2026-01-01").status, "vigente", "início inclusivo");
  assert.equal(deriveGrantWindow(grant, "2026-12-31").status, "vigente", "término inclusivo");
  const expired = deriveGrantWindow(grant, "2027-01-01");
  assert.equal(expired.status, "expirado", "um dia após o término o acesso é perdido");
  assert.equal(expired.days_since_end, 1);
  assert.match(expired.derivation, /acesso perdido ao término, por derivação/);
  assert.equal(deriveGrantWindow(grant, "2025-12-31").status, "nao_iniciado");
  const revoked = deriveGrantWindow({ ...grant, revoked_at: "2026-03-01T00:00:00Z", revoke_reason: "obra concluída" }, "2026-06-15");
  assert.equal(revoked.status, "revogado", "revogação vence a janela ainda vigente");
  assert.equal(revoked.revoke_reason, "obra concluída");
});

test("EXT-02: a decisão de autorização nega escopo não concedido, janela encerrada, futura, revogada e terceiro não ativo", async () => {
  const grant = { id: grantId, scope_kind: "contrato", contract_id: contractId, service_order_id: null, access_start: "2026-01-01", access_end: "2026-12-31", revoked_at: null, justification: "janela sintética" };

  const authorized = deriveAccessDecision({ party: partyRow, grants: [grant], scope: { kind: "contrato", id: contractId }, today: "2026-06-15" });
  assert.equal(authorized.authorized, true);
  assert.equal(authorized.reason, "janela_vigente");
  assert.equal(authorized.grant.id, grantId);

  const ended = deriveAccessDecision({ party: partyRow, grants: [grant], scope: { kind: "contrato", id: contractId }, today: "2027-01-02" });
  assert.equal(ended.authorized, false);
  assert.equal(ended.reason, "janela_encerrada");

  const future = deriveAccessDecision({ party: partyRow, grants: [grant], scope: { kind: "contrato", id: contractId }, today: "2025-06-15" });
  assert.equal(future.authorized, false);
  assert.equal(future.reason, "janela_nao_iniciada");

  const revoked = deriveAccessDecision({ party: partyRow, grants: [{ ...grant, revoked_at: "2026-02-01T00:00:00Z", revoke_reason: "encerrado" }], scope: { kind: "contrato", id: contractId }, today: "2026-06-15" });
  assert.equal(revoked.authorized, false);
  assert.equal(revoked.reason, "janela_revogada");

  const otherScope = deriveAccessDecision({ party: partyRow, grants: [grant], scope: { kind: "contrato", id: otherContractId }, today: "2026-06-15" });
  assert.equal(otherScope.authorized, false);
  assert.equal(otherScope.reason, "escopo_nao_autorizado");

  const wrongKind = deriveAccessDecision({ party: partyRow, grants: [grant], scope: { kind: "ordem_servico", id: contractId }, today: "2026-06-15" });
  assert.equal(wrongKind.authorized, false);
  assert.equal(wrongKind.reason, "escopo_nao_autorizado");

  const inactive = deriveAccessDecision({ party: { ...partyRow, status: "encerrado" }, grants: [grant], scope: { kind: "contrato", id: contractId }, today: "2026-06-15" });
  assert.equal(inactive.authorized, false);
  assert.equal(inactive.reason, "terceiro_nao_ativo");

  const none = deriveAccessDecision({ party: partyRow, grants: [], scope: { kind: "contrato", id: contractId }, today: "2026-06-15" });
  assert.equal(none.authorized, false);
  assert.equal(none.reason, "sem_janela_registrada");
  assert.match(none.derivation, /ausência declarada, acesso não presumido/);

  // Toda decisão carrega fonte, data-base e a fronteira externa declarada.
  for (const decision of [authorized, ended, future, revoked, otherScope, inactive, none]) {
    assert.ok(decision.source.includes(THIRD_PARTY_SOURCES.grants));
    assert.ok(decision.base_date);
    assert.equal(decision.external_actor_boundary.authenticated_third_party_channel, false);
  }
});

test("EXT-02: a rota de autorização impõe a derivação e valida o escopo pedido", async () => {
  const grant = { id: grantId, scope_kind: "contrato", contract_id: contractId, service_order_id: null, access_start: "2020-01-01", access_end: "2020-12-31", revoked_at: null, justification: "janela encerrada" };
  const { pool } = readPool([
    ["SELECT * FROM ext_third_parties WHERE id=$1", [partyRow]],
    ["FROM ext_third_party_access_grants WHERE third_party_id=$1", [grant]],
  ]);
  const handler = api(pool);
  const res = responseCapture();
  await handler.handlePartyAuthorization(request({ url: `/api/ext/third-party/parties/${thirdPartyId}/authorization?scope_kind=contrato&scope_id=${contractId}` }), res, thirdPartyId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.authorized, false);
  assert.equal(res.payload.reason, "janela_encerrada");
  assert.equal(res.payload.third_party_id, thirdPartyId);

  const badScope = responseCapture();
  await handler.handlePartyAuthorization(request({ url: `/api/ext/third-party/parties/${thirdPartyId}/authorization?scope_kind=contrato&scope_id=forjado` }), badScope, thirdPartyId);
  assert.equal(badScope.status, 400);
  assert.equal(badScope.payload.error, "invalid_scope_id");
});

test("EXT-02: terceiro inexistente não vaza existência nem autoriza", async () => {
  const { pool } = readPool();
  const res = responseCapture();
  await api(pool).handlePartyAuthorization(request({ url: `/api/ext/third-party/parties/${thirdPartyId}/authorization?scope_kind=contrato&scope_id=${contractId}` }), res, thirdPartyId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.authorized, false);
  assert.equal(res.payload.reason, "terceiro_inexistente");
});

test("EXT-02: encerrar o terceiro revoga as janelas vivas na MESMA transação, com autor e motivo", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handlePartyById(request({ method: "PATCH", body: { status: "encerrado", reason: "Contrato concluído em campo" } }), res, thirdPartyId);
  assert.equal(res.status, 200);
  const begin = sqlIndex(statements, "BEGIN");
  const updateParty = sqlIndex(statements, "UPDATE ext_third_parties SET status");
  const revoke = sqlIndex(statements, "UPDATE ext_third_party_access_grants");
  const event = sqlIndex(statements, "INSERT INTO ext_third_party_events");
  const audit = sqlIndex(statements, "INSERT INTO audit_log");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(begin < updateParty && updateParty < revoke && revoke < event && event < audit && audit < commit,
    "situação, revogação, evento e auditoria na mesma transação");
  assert.equal(statements[revoke].params[1], identityId, "revogador derivado da sessão");
  assert.match(String(statements[revoke].params[2]), /Terceiro encerrado/);
  assert.ok(statements[revoke].sql.includes("revoked_at IS NULL"), "só janelas ainda vivas");
});

test("EXT-02: revogação exige motivo, é idempotente por chave e recusa janela já revogada", async () => {
  const noReason = mutationPool({ grant: { id: grantId, third_party_id: thirdPartyId, revoked_at: null } });
  const res1 = responseCapture();
  await api(noReason.pool).handleAccessGrantRevoke(request({ method: "POST", body: { reason: "x" } }), res1, grantId);
  assert.equal(res1.status, 400);
  assert.equal(res1.payload.error, "invalid_reason");
  assert.equal(noReason.statements.length, 0);

  const already = mutationPool({ grant: { id: grantId, third_party_id: thirdPartyId, revoked_at: "2026-01-01T00:00:00Z" } });
  const res2 = responseCapture();
  await api(already.pool).handleAccessGrantRevoke(request({ method: "POST", body: { reason: "motivo suficiente" } }), res2, grantId);
  assert.equal(res2.status, 409);
  assert.equal(res2.payload.error, "access_grant_already_revoked");
  assert.ok(sqlIndex(already.statements, "ROLLBACK") >= 0);

  const ok = mutationPool({ grant: { id: grantId, third_party_id: thirdPartyId, revoked_at: null, access_start: "2026-01-01", access_end: "2026-12-31" } });
  const res3 = responseCapture();
  await api(ok.pool).handleAccessGrantRevoke(request({ method: "POST", body: { reason: "obra concluída antes do prazo" } }), res3, grantId);
  assert.equal(res3.status, 200);
  const update = ok.statements[sqlIndex(ok.statements, "UPDATE ext_third_party_access_grants")];
  assert.equal(update.params[1], identityId, "autor da revogação derivado da sessão");
});

// ---------------------------------------------------------------------------
// Vencimentos: derivados da data registrada; 'a vencer' só com regra explícita.
// ---------------------------------------------------------------------------

test("EXT-02: vencimento sem data é declarado, nunca estimado", async () => {
  const result = deriveDocumentExpiry({ document: { expiry_date: null, is_active: true }, rule: null, today: "2026-10-03" });
  assert.equal(result.status, "sem_data_declarada");
  assert.match(result.derivation, /ausência declarada, nunca estimada/);
  assert.equal(result.source, THIRD_PARTY_SOURCES.documents);
  assert.equal(result.base_date, "2026-10-03");
});

test("EXT-02: sem regra de antecedência não existe 'a vencer' inferido", async () => {
  const result = deriveDocumentExpiry({ document: { expiry_date: "2026-10-10", is_active: true }, rule: null, today: "2026-10-03" });
  assert.equal(result.status, "vigente");
  assert.equal(result.alert_rule, null);
  assert.equal(result.alert_rule_absence, "sem_regra_de_antecedencia");
});

test("EXT-02: com regra explícita, 'a vencer' e 'vencido' derivam da data e da antecedência registradas", async () => {
  const rule = { id: "rule-1", alert_before_days: 30, justification: "Política sintética de documentos" };
  const aVencer = deriveDocumentExpiry({ document: { expiry_date: "2026-10-10", is_active: true }, rule, today: "2026-10-03" });
  assert.equal(aVencer.status, "a_vencer");
  assert.equal(aVencer.alert_from, "2026-09-10");
  assert.equal(aVencer.days_to_expiry, 7);
  assert.equal(aVencer.alert_rule.alert_before_days, 30);

  const vigente = deriveDocumentExpiry({ document: { expiry_date: "2027-10-10", is_active: true }, rule, today: "2026-10-03" });
  assert.equal(vigente.status, "vigente");

  const vencido = deriveDocumentExpiry({ document: { expiry_date: "2026-10-02", is_active: true }, rule, today: "2026-10-03" });
  assert.equal(vencido.status, "vencido");
  assert.equal(vencido.days_overdue, 1);

  const limite = deriveDocumentExpiry({ document: { expiry_date: "2026-10-03", is_active: true }, rule, today: "2026-10-03" });
  assert.equal(limite.status, "a_vencer", "no último dia ainda não está vencido");

  const desativado = deriveDocumentExpiry({ document: { expiry_date: "2026-10-02", is_active: false }, rule, today: "2026-10-03" });
  assert.equal(desativado.status, "desativado");
});

test("EXT-02: documento é vinculado pela URL, com autoria da sessão; third_party_id forjado é ignorado", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handlePartyDocuments(request({
    method: "POST",
    body: { document_type: "CNPJ", expiry_date: "2027-01-01", third_party_id: forged, created_by_identity: forged, id: forged, is_active: false },
  }), res, thirdPartyId);
  assert.equal(res.status, 201);
  const insert = statements[sqlIndex(statements, "INSERT INTO ext_third_party_documents")];
  assert.equal(insert.params[0], thirdPartyId, "vínculo derivado da URL");
  assert.equal(insert.params[5], identityId, "autoria derivada da sessão");
  assert.ok(!insert.sql.includes("is_active"), "estado do documento não vem do corpo");
  assert.match(res.payload.note, /não faz upload de arquivo real/);
});

test("EXT-02: documento em terceiro inexistente devolve 404 com rollback", async () => {
  const { statements, pool } = mutationPool({ party: null });
  const res = responseCapture();
  await api(pool).handlePartyDocuments(request({ method: "POST", body: { document_type: "CNPJ" } }), res, thirdPartyId);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, "third_party_not_found");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "COMMIT"), -1);
});

test("EXT-02: desativação de documento registra autor e motivo e recusa repetição", async () => {
  const active = mutationPool({ document: { id: documentId, third_party_id: thirdPartyId, document_type: "CNPJ", is_active: true } });
  const res = responseCapture();
  await api(active.pool).handleDocumentDeactivate(request({ method: "POST", body: { reason: "documento substituído por versão nova" } }), res, documentId);
  assert.equal(res.status, 200);
  const update = active.statements[sqlIndex(active.statements, "UPDATE ext_third_party_documents")];
  assert.equal(update.params[1], identityId, "autor derivado da sessão");
  assert.ok(update.sql.includes("is_active=false"));

  const inactive = mutationPool({ document: { id: documentId, third_party_id: thirdPartyId, document_type: "CNPJ", is_active: false } });
  const res2 = responseCapture();
  await api(inactive.pool).handleDocumentDeactivate(request({ method: "POST", body: { reason: "documento substituído por versão nova" } }), res2, documentId);
  assert.equal(res2.status, 409);
  assert.equal(res2.payload.error, "document_already_inactive");
});

test("EXT-02: registrar nova regra de antecedência desativa a anterior na mesma transação", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handlePartyDocumentRules(request({ method: "POST", body: { alert_before_days: 45, justification: "Política sintética revisada" } }), res, thirdPartyId);
  assert.equal(res.status, 201);
  const deactivate = sqlIndex(statements, "UPDATE ext_third_party_document_rules");
  const insert = sqlIndex(statements, "INSERT INTO ext_third_party_document_rules");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(deactivate >= 0 && deactivate < insert && insert < commit, "desativa a anterior antes de inserir a nova");
  assert.equal(statements[insert].params[3], identityId);
});

test("EXT-02: regra de antecedência exige valor explícito dentro do intervalo", async () => {
  for (const value of [undefined, 0, 366, 1.5, "muitos"]) {
    const { statements, pool } = mutationPool();
    const res = responseCapture();
    await api(pool).handlePartyDocumentRules(request({ method: "POST", body: { alert_before_days: value, justification: "Política sintética" } }), res, thirdPartyId);
    assert.equal(res.status, 400, `valor ${String(value)} deve ser recusado`);
    assert.equal(res.payload.error, "invalid_alert_before_days");
    assert.equal(statements.length, 0);
  }
});

// ---------------------------------------------------------------------------
// Avaliação: autor, data e justificativa; sem nota inventada.
// ---------------------------------------------------------------------------

test("EXT-02: avaliação sem nota, sem justificativa, com data futura ou nota fora da faixa é recusada sem escrever", async () => {
  const cases = [
    [{ justification: "justificativa suficiente", evaluated_on: "2026-01-01" }, "invalid_score"],
    [{ score: 11, justification: "justificativa suficiente", evaluated_on: "2026-01-01" }, "invalid_score"],
    [{ score: -1, justification: "justificativa suficiente", evaluated_on: "2026-01-01" }, "invalid_score"],
    [{ score: 8, justification: "curta", evaluated_on: "2026-01-01" }, "invalid_justification"],
    [{ score: 8, justification: "justificativa suficiente", evaluated_on: "não-é-data" }, "invalid_evaluated_on"],
    [{ score: 8, justification: "justificativa suficiente", evaluated_on: "2099-01-01" }, "evaluated_on_in_future"],
  ];
  for (const [body, expected] of cases) {
    const { statements, pool } = mutationPool();
    const res = responseCapture();
    await api(pool).handlePartyEvaluations(request({ method: "POST", body }), res, thirdPartyId);
    assert.equal(res.status, 400, `esperado 400 para ${expected}`);
    assert.equal(res.payload.error, expected);
    assert.equal(statements.length, 0, "nenhuma escrita antes da validação");
  }
});

test("EXT-02: avaliação registrada tem autor da sessão e a nota do cadastro passa a apontar para ela", async () => {
  const { statements, pool } = mutationPool();
  const res = responseCapture();
  await api(pool).handlePartyEvaluations(request({
    method: "POST",
    body: { score: 8, justification: "Entrega dentro do prazo acordado no contrato sintético.", evaluated_on: "2026-01-15", evaluated_by_identity: forged, id: forged },
  }), res, thirdPartyId);
  assert.equal(res.status, 201);
  const insert = statements[sqlIndex(statements, "INSERT INTO ext_third_party_evaluations")];
  assert.equal(insert.params[0], thirdPartyId, "vínculo da URL");
  assert.equal(insert.params[1], 8);
  assert.equal(insert.params[4], identityId, "autor derivado da sessão, não do corpo");
  const update = statements[sqlIndex(statements, "UPDATE ext_third_parties SET evaluation_score")];
  assert.equal(update.params[1], 8);
  assert.equal(update.params[2], "eval-1", "a nota do cadastro aponta para a avaliação canônica");
  const audit = sqlIndex(statements, "INSERT INTO audit_log");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(audit >= 0 && audit < commit);
});

test("EXT-02: sem avaliação canônica, o dossiê declara a ausência em vez de inventar nota", async () => {
  const { pool } = readPool([
    ["FROM ext_third_parties tp", [{ ...partyRow, evaluation_score: null }]],
    ["FROM ext_third_party_evaluations WHERE third_party_id=$1", []],
  ]);
  const res = responseCapture();
  await api(pool).handlePartyById(request({ url: `/api/ext/third-party/parties/${thirdPartyId}` }), res, thirdPartyId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.evaluation_summary.registered, 0);
  assert.equal(res.payload.evaluation_summary.latest, null);
  assert.match(res.payload.evaluation_summary.note, /nenhuma nota é inventada ou estimada/i);
});

// ---------------------------------------------------------------------------
// Dossiê: fontes e data-base declaradas em tudo que é derivado.
// ---------------------------------------------------------------------------

test("EXT-02: o dossiê declara fonte e data-base de cada bloco derivado", async () => {
  const grant = { id: grantId, third_party_id: thirdPartyId, scope_kind: "contrato", contract_id: contractId, service_order_id: null, access_start: "2026-01-01", access_end: "2026-12-31", revoked_at: null, justification: "janela sintética", granted_at: "2026-01-01T00:00:00Z", granted_by_identity: identityId };
  const { pool } = readPool([
    ["FROM ext_third_parties tp", [partyRow]],
    ["FROM ext_third_party_access_grants g", [grant]],
    ["FROM ext_third_party_documents WHERE third_party_id=$1", [{ id: documentId, document_type: "CNPJ", expiry_date: "2026-10-10", is_active: true }]],
    ["FROM ext_third_party_evaluations WHERE third_party_id=$1", [{ id: "eval-1", score: 8, justification: "ok", evaluated_on: "2026-01-15" }]],
    ["FROM ext_third_party_events WHERE third_party_id=$1", [{ id: "ev-1", event_type: "terceiro_criado", summary: "criado", created_at: "2026-01-01" }]],
  ]);
  const res = responseCapture();
  await api(pool).handlePartyById(request({ url: `/api/ext/third-party/parties/${thirdPartyId}` }), res, thirdPartyId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.source.third_party, THIRD_PARTY_SOURCES.parties);
  assert.equal(res.payload.source.access_grants, THIRD_PARTY_SOURCES.grants);
  assert.equal(res.payload.source.documents, THIRD_PARTY_SOURCES.documents);
  assert.equal(res.payload.source.evaluations, THIRD_PARTY_SOURCES.evaluations);
  assert.ok(res.payload.base_date);
  assert.ok(res.payload.access_grants[0].window.derivation, "janela traz a derivação exposta");
  assert.ok(res.payload.documents[0].expiry.derivation, "vencimento traz a derivação exposta");
  assert.equal(res.payload.access_situation.source, THIRD_PARTY_SOURCES.grants);
  // A tabela legada é declarada como legado e não decide acesso.
  assert.match(res.payload.source.legacy_access_logs, /legado — não decide acesso/);
  assert.equal(res.payload.external_actor_boundary.authenticated_third_party_channel, false);
});

test("EXT-02: deriveAccessSituation declara ausência e não presume acesso", async () => {
  const none = deriveAccessSituation({ party: partyRow, grants: [], today: "2026-06-15" });
  assert.equal(none.status, "sem_janela_registrada");
  assert.match(none.note, /nenhum acesso é presumido/);
  const grant = { id: grantId, scope_kind: "contrato", contract_id: contractId, service_order_id: null, access_start: "2026-01-01", access_end: "2026-12-31", revoked_at: null };
  assert.equal(deriveAccessSituation({ party: partyRow, grants: [grant], today: "2026-06-15" }).status, "com_acesso_vigente");
  assert.equal(deriveAccessSituation({ party: partyRow, grants: [grant], today: "2027-06-15" }).status, "sem_acesso_vigente");
  assert.equal(deriveAccessSituation({ party: { ...partyRow, status: "suspenso" }, grants: [grant], today: "2026-06-15" }).status, "bloqueado_por_situacao_do_terceiro");
});

test("EXT-02: terceiro inexistente devolve 404 no dossiê", async () => {
  const { pool } = readPool();
  const res = responseCapture();
  await api(pool).handlePartyById(request({ url: `/api/ext/third-party/parties/${thirdPartyId}` }), res, thirdPartyId);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, "third_party_not_found");
});

test("EXT-02: referência fora do formato canônico é recusada antes de qualquer consulta", async () => {
  const { statements, pool } = readPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handlePartyById(request({ url: "/api/ext/third-party/parties/forjado" }), res, "forjado");
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_reference");
  assert.equal(statements.length, 0);
});

// ---------------------------------------------------------------------------
// Rotas legadas: leitura autorizada com derivação; mutação aposentada (410).
// ---------------------------------------------------------------------------

test("EXT-02: mutação na rota legada responde 410 apontando a rota canônica", async () => {
  const { statements, pool } = readPool();
  const handler = api(pool);
  for (const [method, fn, canonical] of [
    ["POST", "handleLegacyThirdParties", "/api/ext/third-party/parties"],
    ["PATCH", "handleLegacyThirdParties", "/api/ext/third-party/parties"],
    ["POST", "handleLegacyThirdPartyDocuments", "/api/ext/third-party/parties/<id>/documents"],
  ]) {
    const res = responseCapture();
    await handler[fn](request({ method, url: "/api/ext/third-parties", body: { name: "x" } }), res);
    assert.equal(res.status, 410);
    assert.equal(res.payload.error, "legacy_route_retired");
    assert.equal(res.payload.use, canonical);
  }
  assert.equal(statements.length, 0, "rota aposentada não toca o banco");
});

// A rota legada de terceiros sempre respondeu em `items`. Ao delegar para o
// handler canônico (que responde em `third_parties`), a chave antiga some e o
// leitor legado quebra em silêncio. O alias é obrigatório — e não pode vazar
// para a rota canônica, que tem contrato próprio.
test("EXT-02: leitura legada preserva a chave `items` e aponta a rota canônica, sem vazar o alias", async () => {
  const party = { id: thirdPartyId, name: "Terceiro Legado", status: "ativo", origin: "jornada_terceiros" };

  const legado = readPool([["FROM ext_third_parties tp", [party]]]);
  const resLegado = responseCapture();
  await api(legado.pool).handleLegacyThirdParties(request({ url: "/api/ext/third-parties" }), resLegado);
  assert.equal(resLegado.status, 200);
  assert.ok(Array.isArray(resLegado.payload.items), "o leitor legado continua encontrando `items`");
  assert.equal(resLegado.payload.items.length, 1);
  assert.ok(Array.isArray(resLegado.payload.third_parties), "o payload canônico também é oferecido");
  assert.equal(resLegado.payload.canonical, "/api/ext/third-party/parties");

  const canonico = readPool([["FROM ext_third_parties tp", [party]]]);
  const resCanonico = responseCapture();
  await api(canonico.pool).handleParties(request({ url: "/api/ext/third-party/parties" }), resCanonico);
  assert.equal(resCanonico.status, 200);
  assert.equal(resCanonico.payload.items, undefined, "o alias legado não vaza para a rota canônica");
  assert.ok(Array.isArray(resCanonico.payload.third_parties));
});

test("EXT-02: leitura legada exige o mesmo papel e declara fonte, data-base e derivação", async () => {
  const anon = readPool();
  const resAnon = responseCapture();
  await api(anon.pool, { session: null }).handleLegacyThirdPartyDocuments(request({ url: "/api/ext/third-party-documents" }), resAnon);
  assert.equal(resAnon.status, 401);
  assert.equal(anon.statements.length, 0);

  const rh = readPool();
  const resRh = responseCapture();
  await api(rh.pool, { session: { identityId, role: "rh" } }).handleLegacyThirdPartyDocuments(request({ url: "/api/ext/third-party-documents" }), resRh);
  assert.equal(resRh.status, 403);
  assert.equal(resRh.payload.error, "forbidden_role");

  const { pool } = readPool([
    ["FROM ext_third_party_documents d", [{ id: documentId, third_party_id: thirdPartyId, document_type: "CNPJ", expiry_date: "2020-01-01", is_active: true }]],
  ]);
  const res = responseCapture();
  await api(pool).handleLegacyThirdPartyDocuments(request({ url: "/api/ext/third-party-documents" }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.items[0].expiry.status, "vencido");
  assert.ok(res.payload.base_date);
  assert.equal(res.payload.canonical, "/api/ext/third-party/parties/<id>/documents");
});

test("EXT-02: filtro da leitura legada valida UUID antes de consultar", async () => {
  const { statements, pool } = readPool();
  const res = responseCapture();
  await api(pool).handleLegacyThirdPartyDocuments(request({ url: "/api/ext/third-party-documents?third_party_id=forjado" }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "invalid_third_party_id");
  assert.equal(statements.length, 0);
});

// ---------------------------------------------------------------------------
// Métodos não previstos: histórico é apenas-acréscimo também na API.
// ---------------------------------------------------------------------------

test("EXT-02: histórico é apenas-acréscimo na API — PUT/DELETE respondem 405", async () => {
  const { statements, pool } = readPool();
  const handler = api(pool);
  const checks = [
    ["handlePartyAccessGrants", "DELETE", thirdPartyId],
    ["handlePartyEvaluations", "DELETE", thirdPartyId],
    ["handlePartyDocuments", "PUT", thirdPartyId],
    ["handlePartyDocumentRules", "DELETE", thirdPartyId],
    ["handleAccessGrantRevoke", "DELETE", grantId],
    ["handleDocumentDeactivate", "PUT", documentId],
    ["handlePartyContract", "DELETE", thirdPartyId],
    ["handlePartyAuthorization", "POST", thirdPartyId],
  ];
  for (const [fn, method, id] of checks) {
    const res = responseCapture();
    await handler[fn](request({ method }), res, id);
    assert.equal(res.status, 405, `${fn} com ${method} deve responder 405`);
    assert.equal(res.payload.error, "method_not_allowed");
  }
  const res = responseCapture();
  await handler.handleParties(request({ method: "DELETE" }), res);
  assert.equal(res.status, 405);
  assert.equal(statements.length, 0, "nenhum método não previsto toca o banco");
});
