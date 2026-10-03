import assert from "node:assert/strict";
import { test } from "node:test";
import { createCliFinanceApi } from "../src/server/cli-finance-api.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const companyId = "33333333-3333-4333-8333-333333333333";
const responsibleId = "44444444-4444-4444-8444-444444444444";

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = `/api/client/service-requests?account=${accountId}`, body, key = "cli10-test-key" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    url,
    headers: { host: "portal.test", origin: "https://portal.test", "idempotency-key": key },
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}

function api(pool, session = { identityId }) {
  return createCliFinanceApi({
    pool,
    auditLog: async () => {},
    sameOrigin: () => true,
    requireSession: async () => null,
    requireClientSession: async () => session,
    requireRole: () => false,
  });
}

test("CLI-10 exige sessão cliente antes de consultar", async () => {
  let queried = false;
  const handler = api({ query: async () => { queried = true; } }, null);
  const res = responseCapture();
  await handler.handleServiceRequests(request(), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "client_session_required");
  assert.equal(queried, false);
});

test("CLI-10 nega conta sem grant e audita a recusa", async () => {
  const statements = [];
  const pool = { query: async sql => {
    statements.push(sql);
    if (sql.includes("FROM client_access_grants")) return { rows: [] };
    return { rows: [] };
  } };
  const res = responseCapture();
  await api(pool).handleServiceRequests(request(), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "forbidden");
  assert.ok(statements.some(sql => sql.includes("service_request_list") && sql.includes("denied")));
  assert.ok(!statements.some(sql => sql.includes("FROM cli_service_requests")));
});

test("CLI-10 cria solicitação, oportunidade e auditoria em uma transação", async () => {
  const statements = [];
  const serviceRequest = { id: "55555555-5555-4555-8555-555555555555", protocol: "SRV-CLI-20261003-ABCD" };
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE")) return { rows: [] };
      if (sql.includes("FROM client_access_grants grant_row") && sql.includes("FOR UPDATE")) return { rows: [{
        contract_scope_mode: "all", allowed_contract_ids: [], crm_company_id: companyId,
        responsible_id: responsibleId, responsible_name: "Responsável real",
      }] };
      if (sql.includes("INSERT INTO cli_service_requests")) return { rows: [serviceRequest] };
      return { rows: [] };
    },
    release() { statements.push("RELEASE"); },
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  const res = responseCapture();
  await api(pool).handleServiceRequests(request({
    method: "POST",
    url: "/api/client/service-requests",
    body: { account_id: accountId, title: "Cobertura adicional", description: "Precisamos avaliar cobertura adicional no período noturno." },
  }), res);

  assert.equal(res.status, 201);
  assert.equal(res.payload.serviceRequest.protocol, serviceRequest.protocol);
  assert.match(res.payload.note, /não cria contrato, cobrança ou obrigação/i);
  const begin = statements.indexOf("BEGIN");
  const requestInsert = statements.findIndex(sql => sql.includes("INSERT INTO cli_service_requests"));
  const opportunityInsert = statements.findIndex(sql => sql.includes("INSERT INTO crm_opportunities"));
  const auditInsert = statements.findIndex(sql => sql.includes("service_request_create") && sql.includes("allowed"));
  const commit = statements.indexOf("COMMIT");
  assert.ok(begin >= 0 && begin < requestInsert && requestInsert < opportunityInsert && opportunityInsert < auditInsert && auditInsert < commit);
  assert.ok(!statements.some(sql => /INSERT INTO (client_contracts|cli_charges_v2|crm_contracts|crm_contract_obligations)/.test(sql)));
});
