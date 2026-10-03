import assert from "node:assert/strict";
import { test } from "node:test";
import { createClientEmployeeComplaintApi, HR_MINIMAL_SHARE_FIELDS } from "../src/server/client-employee-complaint-api.mjs";
import { createEmployeeComplaintApi } from "../src/server/employee-complaint-api.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const foreignComplaintId = "99999999-9999-4999-8999-999999999999";

const validBody = {
  client_account_id: accountId,
  category: "comportamento",
  severity: "alta",
  title: "Conduta inadequada no posto",
  description: "Relato detalhado do ocorrido no posto, com data, local e contexto suficiente.",
  employee_reference: "Colaborador do turno da noite",
  is_anonymous: false,
};

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = `/api/client/employee-complaints?account=${accountId}`, body, key = "cli15-test-key" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "portal.test", origin: "https://portal.test" };
  if (key !== null) headers["idempotency-key"] = key;
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}

function api(pool, { session = { identityId }, origin = true } = {}) {
  return createClientEmployeeComplaintApi({
    pool,
    sameOrigin: () => origin,
    requireClientSession: async () => session,
  });
}

function listPool({ granted = true, complaints = [] } = {}) {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes("FROM client_access_grants")) return { rows: granted ? [{ "?column?": 1 }] : [] };
      if (sql.includes("FROM cli_employee_complaints")) return { rows: complaints };
      return { rows: [] };
    },
  };
  return { statements, pool };
}

function openPool({ replayRow = null, granted = true, failAudit = false } = {}) {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (failAudit && sql.includes("auth_access_audit")) throw new Error("audit offline");
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: replayRow ? [replayRow] : [] };
      if (sql.includes("FROM client_access_grants")) return { rows: granted ? [{ "?column?": 1 }] : [] };
      if (sql.includes("INSERT INTO cli_employee_complaints")) {
        return { rows: [{
          id: params[0], protocol: params[1], client_account_id: params[2], category: params[3],
          severity: params[4], title: params[5], description: params[6], is_anonymous: params[7],
          is_restricted: true, minimal_share: true, employee_reference: params[8],
          employee_reference_hash: params[9], is_shared_with_hr: true, shared_with_hr_at: "now",
          created_by_identity: params[10], origin: "portal_cliente", idempotency_key: params[12],
          request_fingerprint: params[13], status: "pendente", created_at: "now", updated_at: "now",
        }] };
      }
      return { rows: [] };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

test("CLI-15: rota do cliente exige sessão de cliente canônica (staff/cookie inválido nega 401)", async () => {
  const { pool } = listPool({});
  const handler = api(pool, { session: null });
  const res = responseCapture();
  await handler.handleComplaints(request({}), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "client_session_required");
});

test("CLI-15: mutação exige same-origin", async () => {
  const { statements, pool } = openPool({});
  const handler = api(pool, { origin: false });
  const res = responseCapture();
  await handler.handleComplaints(request({ method: "POST", body: validBody }), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "origin_forbidden");
  assert.equal(statements.length, 0, "nenhuma query antes da negação de origem");
});

test("CLI-15: isolamento A≠B — conta sem grant responde 403 genérico com auditoria de negação", async () => {
  const { statements, pool } = listPool({ granted: false });
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleComplaints(request({}), res);
  assert.equal(res.status, 403);
  assert.deepEqual(res.payload, { error: "forbidden" });
  const audit = statements.find(s => s.sql.includes("auth_access_audit"));
  assert.ok(audit, "negação é auditada");
  assert.ok(audit.sql.includes("'denied','authorization_denied'"));
  assert.equal(audit.params[0], identityId);
});

test("CLI-15: listagem é escopada pela sessão (identidade + conta + origem portal) e projeta só campos do cliente", async () => {
  const row = {
    id: foreignComplaintId, protocol: "CLI-COMP-20261003-ZZ99", client_account_id: accountId,
    category: "comportamento", severity: "alta", title: "t", description: "d", status: "pendente",
    is_anonymous: false, is_restricted: true, minimal_share: true, is_shared_with_hr: true,
    shared_with_hr_at: "now", created_at: "now", updated_at: "now",
    employee_id: "LEAK", responsible_id: "LEAK", shared_with_hr_by_name: "LEAK",
  };
  const { statements, pool } = listPool({ complaints: [row] });
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleComplaints(request({}), res);
  assert.equal(res.status, 200);
  const listSql = statements.find(s => s.sql.includes("FROM cli_employee_complaints"));
  assert.ok(listSql.sql.includes("origin='portal_cliente'"), "somente jornada do portal");
  assert.ok(listSql.sql.includes("created_by_identity=$1"), "escopo pela identidade da sessão");
  assert.deepEqual(listSql.params, [identityId, accountId]);
  const item = res.payload.complaints[0];
  assert.equal(item.employee_id, undefined, "não expõe vínculo interno de colaborador");
  assert.equal(item.responsible_id, undefined, "não expõe responsável interno");
  assert.equal(item.shared_with_hr_by_name, undefined);
  assert.deepEqual(res.payload.hrMinimalShare.map(f => f.field), ["protocol", "category", "severity", "status"]);
  const audit = statements.find(s => s.sql.includes("auth_access_audit"));
  assert.ok(audit.sql.includes("'allowed','none'"));
});

test("CLI-15: abertura deriva autoria/IDs no servidor e ignora campos forjados do corpo", async () => {
  const { statements, pool } = openPool({});
  const handler = api(pool);
  const res = responseCapture();
  const forged = {
    ...validBody,
    id: foreignComplaintId,
    protocol: "CLI-COMP-19990101-HACK",
    created_by_identity: "33333333-3333-4333-8333-333333333333",
    employee_id: "44444444-4444-4444-8444-444444444444",
    is_shared_with_hr: false,
    is_restricted: false,
    minimal_share: false,
    status: "resolvida",
  };
  await handler.handleComplaints(request({ method: "POST", body: forged }), res);
  assert.equal(res.status, 201);
  const insert = statements.find(s => s.sql.includes("INSERT INTO cli_employee_complaints"));
  assert.notEqual(insert.params[0], foreignComplaintId, "ID gerado no servidor");
  assert.match(insert.params[0], /^[0-9a-f-]{36}$/);
  assert.notEqual(insert.params[1], forged.protocol, "protocolo gerado no servidor");
  assert.match(insert.params[1], /^CLI-COMP-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(insert.params[10], identityId, "autoria é a identidade da sessão, não a do corpo");
  assert.ok(insert.sql.includes("'portal_cliente'"));
  assert.ok(insert.sql.includes("true,true"), "is_restricted e minimal_share forçados no servidor");
  assert.equal(insert.sql.includes("employee_id"), false, "employee_id do corpo nunca é gravado");
  // Histórico e compartilhamento mínimo na MESMA transação da auditoria.
  const begin = statements.findIndex(s => s.sql === "BEGIN");
  const commit = statements.findIndex(s => s.sql === "COMMIT");
  const history = statements.filter(s => s.sql.includes("cli_employee_complaint_history"));
  const shares = statements.filter(s => s.sql.includes("cli_employee_complaint_hr_shares"));
  const audit = statements.findIndex(s => s.sql.includes("auth_access_audit") && s.sql.includes("employee_complaint_open"));
  assert.equal(history.length, 2, "abertura + registro do compartilhamento mínimo");
  assert.equal(shares.length, HR_MINIMAL_SHARE_FIELDS.length, "um registro por campo mínimo compartilhado");
  for (const share of shares) {
    assert.ok(["protocol", "category", "severity", "status"].includes(share.params[1]), `campo mínimo: ${share.params[1]}`);
    assert.ok(share.params[4].length >= 10, "justificativa registrada por campo");
    assert.notEqual(share.params[1], "description");
  }
  assert.ok(begin < audit && audit < commit, "auditoria dentro da transação");
  for (const idx of statements.keys()) {
    if (statements[idx].sql.includes("cli_employee_complaint")) assert.ok(idx > begin && idx < commit);
  }
});

test("CLI-15: abertura exige Idempotency-Key", async () => {
  const { statements, pool } = openPool({});
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleComplaints(request({ method: "POST", body: validBody, key: null }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "idempotency_key_required");
  assert.equal(statements.length, 0);
});

test("CLI-15: retry idêntico devolve a mesma reclamação sem duplicar", async () => {
  const replayRow = {
    id: "55555555-5555-4555-8555-555555555555", protocol: "CLI-COMP-20261003-AB12",
    client_account_id: accountId, category: "comportamento", severity: "alta",
    title: validBody.title, description: validBody.description, status: "pendente",
    is_anonymous: false, is_restricted: true, minimal_share: true, is_shared_with_hr: true,
    shared_with_hr_at: "now", created_at: "now", updated_at: "now",
    request_fingerprint: null,
  };
  // Fingerprint real calculado pela própria implementação na primeira passada.
  const probe = openPool({});
  const first = responseCapture();
  await api(probe.pool).handleComplaints(request({ method: "POST", body: validBody }), first);
  replayRow.request_fingerprint = probe.statements.find(s => s.sql.includes("INSERT INTO cli_employee_complaints")).params[13];

  const { statements, pool } = openPool({ replayRow });
  const res = responseCapture();
  await api(pool).handleComplaints(request({ method: "POST", body: validBody }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.payload.complaint.id, replayRow.id);
  assert.equal(statements.some(s => s.sql.includes("INSERT INTO cli_employee_complaints")), false, "replay não insere nada");
});

test("CLI-15: mesma chave com conteúdo divergente responde 409", async () => {
  const replayRow = { request_fingerprint: "f".repeat(64), id: "55555555-5555-4555-8555-555555555555" };
  const { statements, pool } = openPool({ replayRow });
  const res = responseCapture();
  await api(pool).handleComplaints(request({ method: "POST", body: validBody }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "idempotency_key_reused");
  assert.ok(statements.some(s => s.sql === "ROLLBACK"));
  assert.equal(statements.some(s => s.sql.includes("INSERT INTO")), false);
});

test("CLI-15: falha da auditoria devolve 503 com rollback, sem reclamação parcial", async () => {
  const { statements, pool } = openPool({ failAudit: true });
  const res = responseCapture();
  await api(pool).handleComplaints(request({ method: "POST", body: validBody }), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "employee_complaint_unavailable");
  assert.ok(statements.some(s => s.sql === "ROLLBACK"), "transação revertida");
  assert.equal(statements.some(s => s.sql === "COMMIT"), false, "nada é confirmado");
});

test("CLI-15: detalhe fora do escopo (de outro cliente ou inexistente) responde o mesmo 403 genérico auditado", async () => {
  const { statements, pool } = listPool({ complaints: [] });
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleComplaintById(request({ url: `/api/client/employee-complaints/${foreignComplaintId}` }), res, foreignComplaintId);
  assert.equal(res.status, 403);
  assert.deepEqual(res.payload, { error: "forbidden" });
  const scoped = statements.find(s => s.sql.includes("FROM cli_employee_complaints complaint"));
  assert.ok(scoped.sql.includes("created_by_identity=$1"), "escopo exclusivo pela sessão");
  const audit = statements.find(s => s.sql.includes("auth_access_audit"));
  assert.ok(audit.sql.includes("employee_complaint_view") && audit.sql.includes("'denied'"));
});

test("CLI-15: contas e referências malformadas respondem 400 sem tocar o banco", async () => {
  const { statements, pool } = listPool({});
  const handler = api(pool);
  const badList = responseCapture();
  await handler.handleComplaints(request({ url: "/api/client/employee-complaints?account=not-a-uuid" }), badList);
  assert.equal(badList.status, 400);
  const badBody = responseCapture();
  await handler.handleComplaints(request({ method: "POST", body: { ...validBody, client_account_id: "x" } }), badBody);
  assert.equal(badBody.status, 400);
  const badCat = responseCapture();
  await handler.handleComplaints(request({ method: "POST", body: { ...validBody, category: "hr_only" } }), badCat);
  assert.equal(badCat.status, 400);
  assert.equal(statements.length, 0);
});

function legacyApi(pool, { session, role } = {}) {
  return createEmployeeComplaintApi({
    pool,
    auditLog: async () => {},
    sameOrigin: () => true,
    requireSession: async () => session ?? (role ? { identityId, role } : null),
    requireRole: (sess, roles) => roles.includes((sess.role || "").toLowerCase()) || (sess.role || "").toLowerCase() === "admin",
  });
}

test("CLI-15: rota administrativa legada não é atalho — cookie de cliente não vira sessão staff (401)", async () => {
  const handler = legacyApi({ async query() { throw new Error("não deve consultar"); } }, { session: null });
  const res = responseCapture();
  await handler.handleComplaints(request({ url: "/api/admin/employee-complaints" }), res);
  assert.equal(res.status, 401);
});

test("CLI-15: canal restrito — papéis staff sem autorização recebem 403 em listagem, mensagens e evidências", async () => {
  const pool = { async query() { throw new Error("não deve consultar"); } };
  for (const role of ["operacional", "comercial", "financeiro", "cliente"]) {
    const handler = legacyApi(pool, { role });
    const list = responseCapture();
    await handler.handleComplaints(request({ url: "/api/admin/employee-complaints" }), list);
    assert.equal(list.status, 403);
    assert.equal(list.payload.error, "forbidden_restricted_channel");
    const messages = responseCapture();
    await handler.handleMessages(request({ url: `/api/admin/employee-complaint-messages?complaint_id=${foreignComplaintId}` }), messages);
    assert.equal(messages.status, 403);
    const evidences = responseCapture();
    await handler.handleEvidences(request({ url: `/api/admin/employee-complaint-evidences?complaint_id=${foreignComplaintId}` }), evidences);
    assert.equal(evidences.status, 403);
  }
});

test("CLI-15: RH recebe somente o envelope mínimo de reclamações compartilhadas", async () => {
  const statements = [];
  const fullRow = {
    id: foreignComplaintId, protocol: "CLI-COMP-20261003-AB12", category: "comportamento",
    severity: "alta", status: "pendente", is_restricted: true, minimal_share: true,
    is_shared_with_hr: true, shared_with_hr_at: "now", created_at: "now",
    description: "RELATO RESTRITO", client_account_id: accountId, title: "TITULO RESTRITO",
    employee_reference: "REF RESTRITA", created_by_identity: identityId,
  };
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rows: [fullRow] };
    },
  };
  const handler = legacyApi(pool, { role: "rh" });
  const res = responseCapture();
  await handler.handleComplaints(request({ url: "/api/admin/employee-complaints" }), res);
  assert.equal(res.status, 200);
  assert.ok(statements[0].sql.includes("is_shared_with_hr=true"), "RH lista somente compartilhadas");
  const item = res.payload.items[0];
  assert.equal(item.description, undefined, "descrição nunca vai ao RH");
  assert.equal(item.client_account_id, undefined, "conta do cliente nunca vai ao RH");
  assert.equal(item.title, undefined, "título fora do envelope mínimo");
  assert.equal(item.employee_reference, undefined);
  assert.equal(item.created_by_identity, undefined, "identidade do cliente nunca vai ao RH");
  assert.deepEqual(Object.keys(item).sort(), ["category", "created_at", "id", "is_restricted", "is_shared_with_hr", "minimal_share", "protocol", "severity", "shared_with_hr_at", "status"].sort());
});

test("CLI-15: RH não consulta detalhe de reclamação não compartilhada (404)", async () => {
  const pool = {
    async query(sql) {
      if (sql.includes("FROM cli_employee_complaints")) return { rows: [{ id: foreignComplaintId, is_shared_with_hr: false }] };
      return { rows: [] };
    },
  };
  const handler = legacyApi(pool, { role: "rh" });
  const res = responseCapture();
  await handler.handleComplaintById(request({ url: `/api/admin/employee-complaints/${foreignComplaintId}` }), res);
  assert.equal(res.status, 404);
});
