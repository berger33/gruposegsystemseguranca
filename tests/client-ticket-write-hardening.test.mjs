import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClientSpaceApi } from "../src/server/client-space-api.mjs";

// L08 (CLI-04/CLI-05) hardening, migração 139: escrita de negócio, histórico e
// auditoria na mesma transação; falha de auditoria devolve 503 e reverte tudo;
// retry com a mesma idempotency_key não duplica protocolo — nem sequencial,
// nem sob corrida — e conteúdo diferente com a mesma chave é conflito
// explícito (409). Injeção de falhas em memória: nenhum servidor nem banco
// real é aberto aqui; a prova PostgreSQL/HTTP fica no subteste de integração.

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const IDENTITY = "22222222-2222-4222-8222-222222222222";
const GRANT = "33333333-3333-4333-8333-333333333333";
const DOCUMENT = "66666666-6666-4666-8666-666666666666";
const TICKET = "77777777-7777-4777-8777-777777777777";
const KEY = "qa-idem-key-00000001";

const BODY = { accountId: ACCOUNT, category: "Outro assunto", title: "Chamado sintético QA", details: "Conteúdo sintético de teste." };
const fingerprintOf = body => createHash("sha256")
  .update(JSON.stringify({ accountId: body.accountId, category: body.category, title: body.title, details: body.details }))
  .digest("hex");

function fixture({
  auditFails = false,
  insertRace = false,
  existingRow = null,
  racedRow = null,
  document = null,
  docsDir = "/tmp",
  body = { ...BODY, idempotency_key: KEY },
  adminBody = null,
} = {}) {
  const calls = [];
  const events = [];
  let replayReads = 0;
  const route = async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") { events.push(sql); return { rows: [] }; }
    if (sql.includes("INSERT INTO auth_access_audit")) {
      events.push("AUDIT_TRIED");
      if (auditFails) throw new Error("synthetic audit failure");
      return { rows: [] };
    }
    if (sql.includes("FROM client_access_grants g") && sql.includes("JOIN client_accounts a")) return { rows: [{ id: GRANT }] };
    if (sql.includes("SELECT g.unit_account_id FROM client_access_grants")) return { rows: [{ unit_account_id: null }] };
    if (sql.includes("FROM client_tickets") && sql.includes("idempotency_key")) {
      const read = replayReads;
      replayReads += 1;
      if (read === 0) return { rows: existingRow ? [existingRow] : [] };
      return { rows: racedRow ? [racedRow] : [] };
    }
    if (sql.includes("INSERT INTO client_tickets")) {
      events.push("INSERT_TICKET_TRIED");
      if (insertRace) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505", constraint: "client_tickets_idempotency_uidx" });
      return { rows: [] };
    }
    if (sql.includes("SELECT status FROM client_tickets WHERE id = $1 FOR UPDATE")) return { rows: [{ status: "open" }] };
    if (sql.includes("UPDATE client_tickets SET status")) { events.push("UPDATE_TICKET_TRIED"); return { rows: [] }; }
    if (sql.includes("INSERT INTO client_ticket_status_audit")) return { rows: [] };
    if (sql.includes("SELECT * FROM client_documents WHERE id = $1")) return { rows: document ? [document] : [] };
    throw new Error(`Unexpected SQL in hardening fixture: ${sql.slice(0, 120)}`);
  };
  const pool = {
    query: route,
    connect: async () => {
      events.push("CONNECT");
      return { query: route, release: () => events.push("RELEASE") };
    },
  };
  const api = createClientSpaceApi({
    getPool: () => pool,
    docsDir,
    readClientSession: async () => ({ identityId: IDENTITY }),
    readAdminSession: async () => ({ role: "ti", identityId: IDENTITY }),
    sameOrigin: () => true,
    readJson: async () => adminBody ?? body,
    json: (res, status, payload) => { if (res.status) throw new Error("duplicate response"); res.status = status; res.body = payload; return payload; },
  });
  return {
    api,
    calls,
    events,
    count: pattern => calls.filter(c => String(c.sql).includes(pattern)).length,
    connects: () => events.filter(event => event === "CONNECT").length,
  };
}

const ticketUrl = new URL("http://local.invalid/api/client/tickets");

test("CLI-05 ticket creation writes ticket and audit in ONE transaction", async () => {
  const t = fixture();
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  assert.match(res.body.ticketId, /^[0-9a-f-]{36}$/);
  assert.equal(t.count("INSERT INTO client_tickets"), 1);
  assert.equal(t.count("INSERT INTO auth_access_audit"), 1);
  const seq = t.events.filter(event => ["BEGIN", "AUDIT_TRIED", "COMMIT", "ROLLBACK"].includes(event));
  assert.deepEqual(seq, ["BEGIN", "AUDIT_TRIED", "COMMIT"]);
});

test("CLI-05 audit failure returns 503 and rolls back the ticket (no partial success)", async () => {
  const t = fixture({ auditFails: true });
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 503);
  assert.equal(res.body.error, "client_space_unavailable");
  const seq = t.events.filter(event => ["BEGIN", "INSERT_TICKET_TRIED", "AUDIT_TRIED", "COMMIT", "ROLLBACK"].includes(event));
  assert.deepEqual(seq, ["BEGIN", "INSERT_TICKET_TRIED", "AUDIT_TRIED", "ROLLBACK"]);
});

test("CLI-05 replay with same key and same content returns the existing ticket without duplicating", async () => {
  const existingRow = { id: TICKET, status: "open", content_fingerprint: fingerprintOf(BODY) };
  const t = fixture({ existingRow });
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 200);
  assert.equal(res.body.idempotent_replay, true);
  assert.equal(res.body.ticketId, TICKET);
  assert.equal(t.count("INSERT INTO client_tickets"), 0);
  assert.equal(t.count("INSERT INTO auth_access_audit"), 0);
});

test("CLI-05 same key with different content is an explicit 409 conflict, never silent rewrite", async () => {
  const existingRow = { id: TICKET, status: "open", content_fingerprint: "f".repeat(64) };
  const t = fixture({ existingRow });
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "idempotency_key_conflict");
  assert.equal(t.count("INSERT INTO client_tickets"), 0);
});

test("CLI-05 concurrent retry that loses the unique race rereads the winner instead of duplicating", async () => {
  const racedRow = { id: TICKET, status: "open", content_fingerprint: fingerprintOf(BODY) };
  const t = fixture({ insertRace: true, racedRow });
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 200);
  assert.equal(res.body.idempotent_replay, true);
  assert.equal(res.body.ticketId, TICKET);
  assert.equal(t.events.filter(event => event === "COMMIT").length, 0);
});

test("CLI-05 concurrent race with different content under the same key resolves to 409", async () => {
  const racedRow = { id: TICKET, status: "open", content_fingerprint: "0".repeat(64) };
  const t = fixture({ insertRace: true, racedRow });
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "idempotency_key_conflict");
});

test("CLI-05 malformed idempotency key is refused before opening any transaction", async () => {
  const t = fixture({ body: { ...BODY, idempotency_key: "curta" } });
  const res = {};
  await t.api.handleClientTickets({ method: "POST" }, res, ticketUrl);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "idempotency_key_8_200");
  assert.equal(t.connects(), 0);
});

test("CLI-04 private download audit is recorded BEFORE any byte; failure means 503 and zero bytes", async () => {
  const docsDir = await mkdtemp(path.join(tmpdir(), "seg-l08-docs-"));
  try {
    const storageKey = "a".repeat(48);
    const bytes = Buffer.from("documento privado sintético\n", "utf8");
    await writeFile(path.join(docsDir, storageKey), bytes);
    const document = {
      id: DOCUMENT,
      client_account_id: ACCOUNT,
      storage_key: storageKey,
      original_filename: "qa.txt",
      content_type: "text/plain",
      size_bytes: bytes.length,
      content_sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const t = fixture({ auditFails: true, docsDir, document });
    const res = { writeHead() { res.headSent = true; } };
    await t.api.handleClientDocumentDownload({ method: "GET" }, res, DOCUMENT);
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "client_space_unavailable");
    assert.equal(res.headSent, undefined, "no byte of the private document may be sent without the durable audit row");
  } finally {
    await rm(docsDir, { recursive: true, force: true });
  }
});

test("CLI-05 admin ticket status keeps business write, history and audit atomic; audit failure rolls back", async () => {
  const t = fixture({ auditFails: true, adminBody: { status: "in_progress", adminResponse: "Resposta sintética da equipe." } });
  const res = {};
  await t.api.handleAdminTicketUpdate({ method: "PATCH" }, res, TICKET);
  assert.equal(res.status, 503);
  assert.equal(res.body.error, "client_space_unavailable");
  const seq = t.events.filter(event => ["BEGIN", "UPDATE_TICKET_TRIED", "AUDIT_TRIED", "COMMIT", "ROLLBACK"].includes(event));
  assert.deepEqual(seq, ["BEGIN", "UPDATE_TICKET_TRIED", "AUDIT_TRIED", "ROLLBACK"]);
});
