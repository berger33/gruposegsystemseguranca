import assert from "node:assert/strict";
import { test } from "node:test";
import { createCliFinanceApi } from "../src/server/cli-finance-api.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const commId = "77777777-7777-4777-8777-777777777777";
const contractId = "33333333-3333-4333-8333-333333333333";
const crmCompanyId = "55555555-5555-4555-8555-555555555555";

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = `/api/client/renewal-communications?account=${accountId}`, body, key = "cli12-test-key" } = {}) {
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

function listPool({ communications, crmCompany = crmCompanyId, contracts = [], crmRenewals = [] }) {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes("grant_row.contract_scope_mode")) {
        return { rows: [{ contract_scope_mode: "all", allowed_contract_ids: [], crm_company_id: crmCompany }] };
      }
      if (sql.includes("FROM cli_renewal_communications comm")) return { rows: communications };
      if (sql.includes("FROM cli_renewal_comm_responses")) return { rows: [] };
      if (sql.includes("FROM client_contracts")) return { rows: contracts };
      if (sql.includes("FROM crm_renewals")) return { rows: crmRenewals };
      return { rows: [] };
    },
  };
  return { statements, pool };
}

function respondPool({ commType = "proposta_renovacao", existingKinds = [] }) {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: [] };
      if (sql.includes("FROM cli_renewal_communications comm")) {
        return { rows: [{ id: commId, comm_type: commType, client_account_id: accountId }] };
      }
      if (sql.includes("SELECT id FROM cli_renewal_comm_responses")) {
        return { rows: existingKinds.includes(params[2]) ? [{ id: "existing" }] : [] };
      }
      if (sql.includes("INSERT INTO cli_renewal_comm_responses")) {
        return { rows: [{ id: params[0], communication_id: params[1], client_account_id: params[2], identity_id: params[3], response_kind: params[4] }] };
      }
      return { rows: [] };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

const ackBody = { communication_id: commId, response_kind: "ciencia" };

test("CLI-12 exige sessão cliente antes de consultar comunicações", async () => {
  let queried = false;
  const handler = api({ query: async () => { queried = true; } }, null);
  const res = responseCapture();
  await handler.handleRenewalCommunications(request(), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "client_session_required");
  assert.equal(queried, false);
});

test("CLI-12 nega conta sem grant, audita a recusa e não lê comunicações", async () => {
  const statements = [];
  const pool = { query: async sql => { statements.push(sql); return { rows: [] }; } };
  const res = responseCapture();
  await api(pool).handleRenewalCommunications(request(), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "forbidden");
  assert.ok(statements.some(sql => sql.includes("renewal_communication_list") && sql.includes("denied")));
  assert.ok(!statements.some(sql => sql.includes("FROM cli_renewal_communications")));
});

test("CLI-12 lista só comunicações enviadas da conta e inadimplência não restringe o portal", async () => {
  const { statements, pool } = listPool({
    communications: [{
      id: commId, protocol: "REN-CLI-20261003-ABCD", comm_type: "aviso_vencimento",
      title: "Aviso de vencimento", content: "Seu contrato vence em breve conforme registro.",
      sent_at: "2026-10-01T10:00:00Z", is_blocking: false, block_reason: null,
      contract_id: contractId, contract_title: "Portaria 24h", contract_ends_on: "2026-12-31",
      created_at: "2026-10-01T09:00:00Z",
    }],
  });
  const res = responseCapture();
  await api(pool).handleRenewalCommunications(request(), res);

  assert.equal(res.status, 200);
  assert.equal(res.payload.communications.length, 1);
  assert.deepEqual(res.payload.communications[0].allowed_response_kinds, ["ciencia", "interesse_renovar", "solicitar_contato"]);
  assert.equal(res.payload.accessRestriction.restricted, false);
  // A listagem expõe apenas comunicações com envio local registrado.
  const listSql = statements.find(s => s.sql.includes("FROM cli_renewal_communications comm")).sql;
  assert.ok(listSql.includes("sent_at IS NOT NULL"));
  // Prova de não bloqueio indiscriminado: nenhuma consulta a cli_charges_v2
  // (inadimplência) participa da leitura ou da decisão de acesso.
  assert.ok(!statements.some(s => s.sql.includes("cli_charges_v2")));
  assert.ok(statements.some(s => s.sql.includes("renewal_communication_list") && s.sql.includes("allowed")));
});

test("CLI-12 declara restrição apenas de encerramento bloqueante com motivo e origem", async () => {
  const { pool } = listPool({
    communications: [
      {
        id: commId, protocol: "REN-CLI-20261003-BLCK", comm_type: "encerramento",
        title: "Encerramento do contrato", content: "Encerramento registrado conforme tratativa formal.",
        sent_at: "2026-10-01T10:00:00Z", is_blocking: true,
        block_reason: "Encerramento formalizado em tratativa assinada pelas partes.",
        contract_id: null, contract_title: null, contract_ends_on: null,
        created_at: "2026-10-01T09:00:00Z",
      },
      {
        id: "88888888-8888-4888-8888-888888888888", protocol: "REN-CLI-20261003-AVSO",
        comm_type: "aviso_vencimento", title: "Aviso", content: "Aviso de vencimento registrado para a conta.",
        sent_at: "2026-09-01T10:00:00Z", is_blocking: false, block_reason: null,
        contract_id: null, contract_title: null, contract_ends_on: null,
        created_at: "2026-09-01T09:00:00Z",
      },
    ],
  });
  const res = responseCapture();
  await api(pool).handleRenewalCommunications(request(), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.accessRestriction.restricted, true);
  assert.equal(res.payload.accessRestriction.reason, "Encerramento formalizado em tratativa assinada pelas partes.");
  assert.equal(res.payload.accessRestriction.origin, "cli_renewal_communications");
  assert.equal(res.payload.accessRestriction.protocol, "REN-CLI-20261003-BLCK");
});

test("CLI-12 expõe vencimentos canônicos com fonte declarada e ausência preservada", async () => {
  const { statements, pool } = listPool({
    communications: [],
    contracts: [
      { id: contractId, title: "Portaria 24h", status: "active", ends_on: "2026-12-31" },
      { id: "99999999-9999-4999-8999-999999999999", title: "CFTV", status: "active", ends_on: null },
    ],
    crmRenewals: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Renovação anual", status: "planejada", renewal_date: null }],
  });
  const res = responseCapture();
  await api(pool).handleRenewalCommunications(request(), res);
  assert.equal(res.status, 200);
  const dates = res.payload.renewalDates;
  assert.ok(dates.as_of);
  assert.equal(dates.contracts[0].source, "client_contracts.ends_on");
  assert.equal(dates.contracts[0].ends_on, "2026-12-31");
  // Ausência de dado é declarada como nula; nunca vira zero ou "em dia".
  assert.equal(dates.contracts[1].ends_on, null);
  assert.equal(dates.crmRenewals[0].source, "crm_renewals.renewal_date");
  assert.equal(dates.crmRenewals[0].renewal_date, null);
  assert.ok(statements.some(s => s.sql.includes("FROM crm_renewals")));

  // Sem empresa CRM vinculada, crm_renewals nem é consultada: nada é inventado.
  const { statements: without, pool: poolWithout } = listPool({ communications: [], crmCompany: null });
  const res2 = responseCapture();
  await api(poolWithout).handleRenewalCommunications(request(), res2);
  assert.equal(res2.status, 200);
  assert.deepEqual(res2.payload.renewalDates.crmRenewals, []);
  assert.ok(!without.some(s => s.sql.includes("FROM crm_renewals")));
});

test("CLI-12 registra ciência com autoria da sessão e auditoria na mesma transação", async () => {
  const { statements, pool } = respondPool({ commType: "proposta_renovacao" });
  const res = responseCapture();
  // Corpo tenta forjar identidade e conta: ambos são ignorados no servidor.
  await api(pool).handleRenewalCommunications(request({
    method: "POST", url: "/api/client/renewal-communications",
    body: { ...ackBody, identity_id: "99999999-9999-4999-8999-999999999999", client_account_id: "99999999-9999-4999-8999-999999999999" },
  }), res);

  assert.equal(res.status, 201);
  assert.equal(res.payload.response.response_kind, "ciencia");
  const sqls = statements.map(s => s.sql);
  const begin = sqls.indexOf("BEGIN");
  const scope = sqls.findIndex(sql => sql.includes("FOR UPDATE OF comm"));
  const insert = sqls.findIndex(sql => sql.includes("INSERT INTO cli_renewal_comm_responses"));
  const audit = sqls.findIndex(sql => sql.includes("renewal_communication_respond") && sql.includes("allowed"));
  const commit = sqls.indexOf("COMMIT");
  assert.ok(begin >= 0 && begin < scope && scope < insert && insert < audit && audit < commit);
  // Autoria derivada da sessão e conta derivada da comunicação, não do corpo.
  const insertParams = statements[insert].params;
  assert.equal(insertParams[3], identityId);
  assert.equal(insertParams[2], accountId);
  // A manifestação não renova contrato, não cria cobrança e não altera valor.
  assert.ok(!sqls.some(sql => /INSERT INTO (client_contracts|cli_charges_v2|crm_contracts|crm_renewals)/.test(sql)));
  assert.ok(!sqls.some(sql => /UPDATE (client_contracts|cli_charges_v2|crm_contracts|crm_renewals)/.test(sql)));
});

test("CLI-12 recusa tipo que não permite a manifestação e segunda manifestação igual", async () => {
  const { statements, pool } = respondPool({ commType: "encerramento" });
  const res = responseCapture();
  await api(pool).handleRenewalCommunications(request({
    method: "POST", url: "/api/client/renewal-communications",
    body: { communication_id: commId, response_kind: "interesse_renovar" },
  }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "response_kind_not_allowed_for_type");
  assert.ok(statements.map(s => s.sql).includes("ROLLBACK"));
  assert.ok(!statements.some(s => s.sql.includes("INSERT INTO cli_renewal_comm_responses")));

  const { statements: dupStatements, pool: dupPool } = respondPool({ commType: "proposta_renovacao", existingKinds: ["ciencia"] });
  const dupRes = responseCapture();
  await api(dupPool).handleRenewalCommunications(request({ method: "POST", url: "/api/client/renewal-communications", body: ackBody, key: "cli12-new-key" }), dupRes);
  assert.equal(dupRes.status, 409);
  assert.equal(dupRes.payload.error, "response_already_registered");
  assert.ok(!dupStatements.some(s => s.sql.includes("INSERT INTO cli_renewal_comm_responses")));
});

test("CLI-12 valida entrada sem abrir transação", async () => {
  let connected = false;
  const pool = { connect: async () => { connected = true; return null; }, query: async () => ({ rows: [] }) };
  const handler = api(pool);

  const invalidRef = responseCapture();
  await handler.handleRenewalCommunications(request({ method: "POST", url: "/api/client/renewal-communications", body: { ...ackBody, communication_id: "x" } }), invalidRef);
  assert.equal(invalidRef.status, 400);
  assert.equal(invalidRef.payload.error, "invalid_reference");

  const invalidKind = responseCapture();
  await handler.handleRenewalCommunications(request({ method: "POST", url: "/api/client/renewal-communications", body: { ...ackBody, response_kind: "renovar_agora" } }), invalidKind);
  assert.equal(invalidKind.status, 400);
  assert.equal(invalidKind.payload.error, "invalid_response_kind");

  const noKey = responseCapture();
  await handler.handleRenewalCommunications(request({ method: "POST", url: "/api/client/renewal-communications", body: ackBody, key: "x" }), noKey);
  assert.equal(noKey.status, 400);
  assert.equal(noKey.payload.error, "idempotency_key_required");

  const shortMessage = responseCapture();
  await handler.handleRenewalCommunications(request({ method: "POST", url: "/api/client/renewal-communications", body: { ...ackBody, message: "oi" } }), shortMessage);
  assert.equal(shortMessage.status, 400);
  assert.equal(shortMessage.payload.error, "message_5_1000");

  assert.equal(connected, false);
});

test("CLI-12 recusa chave idempotente reusada com conteúdo diferente", async () => {
  const stored = { id: "stored", request_fingerprint: "0".repeat(64) };
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: [stored] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  const res = responseCapture();
  await api(pool).handleRenewalCommunications(request({ method: "POST", url: "/api/client/renewal-communications", body: ackBody }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "idempotency_key_reused");
  assert.ok(statements.includes("ROLLBACK"));
});

test("CLI-12 não consulta inadimplência na autorização das demais jornadas do portal", async () => {
  // Reforço do não bloqueio indiscriminado: as leituras autenticadas de
  // solicitações (CLI-10) e satisfação (CLI-11) também decidem acesso sem
  // consultar cli_charges_v2.
  const statements = [];
  const pool = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM client_access_grants grant_row")) return { rows: [{ ok: 1 }] };
      return { rows: [] };
    },
  };
  const handler = api(pool);
  const srv = responseCapture();
  await handler.handleServiceRequests(request({ url: `/api/client/service-requests?account=${accountId}` }), srv);
  assert.equal(srv.status, 200);
  const sat = responseCapture();
  await handler.handleSatisfactionSurveys(request({ url: `/api/client/satisfaction-surveys?account=${accountId}` }), sat);
  assert.equal(sat.status, 200);
  assert.ok(!statements.some(sql => sql.includes("cli_charges_v2")));
});
