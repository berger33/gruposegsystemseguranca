// F03 — cliente → chamado → atendimento → aceite.
// Testes puros: máquina de estados, validações e recusas do servidor em
// memória. Nenhum banco, servidor HTTP ou navegador é aberto aqui; a prova
// real da jornada vive em npm run test:f03-client-ticket-service-acceptance:pg.
import test from "node:test";
import assert from "node:assert/strict";
import { createClientSpaceApi } from "../src/server/client-space-api.mjs";
import {
  TICKET_SERVICE_TRANSITIONS,
  isTicketServiceTransitionAllowed,
  isTicketServiceReopen,
  validateTicketServiceNote,
  validateReportInput,
  TEXT_LIMITS,
} from "../src/lib/client-space-core.mjs";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const TICKET = "22222222-2222-4222-8222-222222222222";
const IDENTITY = "33333333-3333-4333-8333-333333333333";
const REPORT = "44444444-4444-4444-8444-444444444444";

test("F03 a máquina de atendimento nunca oferece 'closed' como passo da equipe", () => {
  const destinations = Object.values(TICKET_SERVICE_TRANSITIONS).flat();
  assert.equal(destinations.includes("closed"), false, "encerrar é ato do cliente, não da equipe");
  assert.deepEqual(TICKET_SERVICE_TRANSITIONS.open, ["in_progress"]);
  assert.deepEqual(TICKET_SERVICE_TRANSITIONS.in_progress, ["waiting_client", "resolved"]);
  assert.deepEqual(TICKET_SERVICE_TRANSITIONS.waiting_client, ["in_progress"]);
});

test("F03 transições permitidas e proibidas do atendimento", () => {
  assert.equal(isTicketServiceTransitionAllowed("open", "in_progress"), true);
  assert.equal(isTicketServiceTransitionAllowed("in_progress", "resolved"), true);
  assert.equal(isTicketServiceTransitionAllowed("waiting_client", "in_progress"), true);
  // Pular o atendimento é proibido: não existe chamado resolvido sem atendimento.
  assert.equal(isTicketServiceTransitionAllowed("open", "resolved"), false);
  assert.equal(isTicketServiceTransitionAllowed("open", "waiting_client"), false);
  // Repetir o mesmo estado não é transição; é replay e precisa de chave.
  assert.equal(isTicketServiceTransitionAllowed("in_progress", "in_progress"), false);
  assert.equal(isTicketServiceTransitionAllowed("resolved", "closed"), false);
  assert.equal(isTicketServiceTransitionAllowed("open", "inventado"), false);
  // Reabertura pela equipe continua existindo e é marcada como tal.
  assert.equal(isTicketServiceReopen("resolved", "in_progress"), true);
  assert.equal(isTicketServiceReopen("closed", "open"), true);
  assert.equal(isTicketServiceReopen("open", "in_progress"), false);
});

test("F03 cada passo do atendimento devolve mensagem ao cliente", () => {
  assert.equal(validateTicketServiceNote("").error, "ticket_service_note_required");
  assert.equal(validateTicketServiceNote("ok").error, "ticket_service_note_required");
  assert.equal(validateTicketServiceNote("a".repeat(TEXT_LIMITS.ticketResponse + 1)).error, "ticket_response_too_long");
  assert.equal(validateTicketServiceNote("<script>").error, "ticket_service_note_invalid");
  assert.equal(validateTicketServiceNote("  Equipe a caminho  ").value, "Equipe a caminho");
});

test("F03 o relatório canônico aceita o vínculo com o chamado de origem", () => {
  const parsed = validateReportInput({
    accountId: ACCOUNT,
    ticketId: TICKET,
    reportType: "acceptance",
    title: "Aceite do chamado sintético",
    summary: "Resumo sintético com tamanho suficiente para o aceite.",
  });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.value.ticketId, TICKET);
  assert.equal(validateReportInput({ accountId: ACCOUNT, title: "x", summary: "y".repeat(25) }).value.ticketId, null);
});

function adminFixture({ body, headers = {}, rows = {}, session = { role: "ti", identityId: IDENTITY } } = {}) {
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("information_schema.columns")) {
        return { rows: [{ lifecycle: true, idempotency: true }] };
      }
      throw new Error(`consulta inesperada: ${sql.slice(0, 80)}`);
    },
    async connect() {
      throw new Error("transação aberta antes da validação do comando");
    },
  };
  const api = createClientSpaceApi({
    getPool: () => db,
    docsDir: "/tmp",
    readAdminSession: async () => session,
    readClientSession: async () => null,
    sameOrigin: () => true,
    readJson: async () => body,
    json: (res, status, payload) => { res.status = status; res.body = payload; return payload; },
    ...rows,
  });
  const res = {};
  const req = { method: "PATCH", headers: { "content-type": "application/json", ...headers } };
  return { api, res, req, statements };
}

test("F03 o atendimento exige chave de idempotência antes de abrir transação", async () => {
  const t = adminFixture({ body: { status: "in_progress", adminResponse: "Equipe iniciou o atendimento." } });
  await t.api.handleAdminTicketUpdate(t.req, t.res, TICKET);
  assert.equal(t.res.status, 400);
  assert.equal(t.res.body.error, "idempotency_key_required_or_invalid");
});

test("F03 o atendimento exige mensagem ao cliente antes de abrir transação", async () => {
  const t = adminFixture({
    body: { status: "in_progress", adminResponse: "ok" },
    headers: { "idempotency-key": "f03-unit-service-key-0001" },
  });
  await t.api.handleAdminTicketUpdate(t.req, t.res, TICKET);
  assert.equal(t.res.status, 400);
  assert.equal(t.res.body.error, "ticket_service_note_required");
});

test("F03 a equipe não encerra o chamado: o encerramento depende do aceite do cliente", async () => {
  const t = adminFixture({
    body: { status: "closed", adminResponse: "Vou encerrar sem passar pelo cliente." },
    headers: { "idempotency-key": "f03-unit-service-key-0002" },
  });
  await t.api.handleAdminTicketUpdate(t.req, t.res, TICKET);
  assert.equal(t.res.status, 409);
  assert.equal(t.res.body.error, "ticket_close_requires_client_acceptance");
});

test("F03 esquema de ciclo de vida sem a migração 158 recusa fechado", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("information_schema.columns")) return { rows: [{ lifecycle: true, idempotency: false }] };
      throw new Error("nenhuma outra consulta pode acontecer");
    },
    async connect() { throw new Error("nenhuma transação pode ser aberta"); },
  };
  const api = createClientSpaceApi({
    getPool: () => db,
    docsDir: "/tmp",
    readAdminSession: async () => ({ role: "ti", identityId: IDENTITY }),
    readClientSession: async () => null,
    sameOrigin: () => true,
    readJson: async () => ({ status: "in_progress", adminResponse: "Atendimento iniciado." }),
    json: (res, status, payload) => { res.status = status; res.body = payload; return payload; },
  });
  const res = {};
  await api.handleAdminTicketUpdate({ method: "PATCH", headers: { "idempotency-key": "f03-unit-service-key-0003" } }, res, TICKET);
  assert.equal(res.status, 503);
  assert.equal(res.body.error, "migration_required");
});

test("F03 sessão de cliente nunca comanda o atendimento e sessão de RH é recusada", async () => {
  for (const session of [null, { role: "rh", identityId: IDENTITY }, { role: "ti", identityId: null }]) {
    const t = adminFixture({
      body: { status: "in_progress", adminResponse: "Tentativa indevida de atendimento." },
      headers: { "idempotency-key": "f03-unit-service-key-0004" },
      session,
    });
    await t.api.handleAdminTicketUpdate(t.req, t.res, TICKET);
    assert.ok([401, 403].includes(t.res.status), `sessão ${JSON.stringify(session)} não pode atender`);
    assert.deepEqual(t.statements, [], "nenhuma consulta pode acontecer antes da autorização");
  }
});

test("F03 o aceite do cliente só é aceito em PATCH de mesma origem com sessão de cliente", async () => {
  const api = createClientSpaceApi({
    getPool: () => ({ async query() { throw new Error("nenhuma leitura pode acontecer"); } }),
    docsDir: "/tmp",
    readAdminSession: async () => null,
    readClientSession: async () => null,
    sameOrigin: () => false,
    readJson: async () => ({ note: "aceito" }),
    json: (res, status, payload) => { res.status = status; res.body = payload; return payload; },
  });
  const crossOrigin = {};
  await api.handleClientReportAcknowledge({ method: "PATCH", headers: {} }, crossOrigin, REPORT);
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.body.error, "same_origin_required");

  const wrongMethod = {};
  await api.handleClientReportAcknowledge({ method: "POST", headers: {} }, wrongMethod, REPORT);
  assert.equal(wrongMethod.status, 405);
});
