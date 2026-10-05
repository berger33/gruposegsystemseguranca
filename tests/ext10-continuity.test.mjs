// EXT-10 / F06 — contratos estáticos e guards da jornada canônica.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createExtContinuityApi } from "../src/server/ext-continuity-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
const identity = "11111111-1111-4111-8111-111111111111";
const plan = "22222222-2222-4222-8222-222222222222";

function req({ method = "GET", url = "/api/ext/continuity/plans", body, headers = {} } = {}) {
  const stream = (async function* () {
    if (body !== undefined) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  })();
  stream.method = method;
  stream.url = url;
  stream.headers = { origin: "https://seg.test", host: "seg.test", "idempotency-key": "ext10-unit-key-001", ...headers };
  return stream;
}

function response() {
  return {
    statusCode: 200,
    body: "",
    writeHead(status) { this.statusCode = status; },
    end(body) { this.body += body || ""; },
    json() { return JSON.parse(this.body); },
  };
}

function poolForCreate({ permission = true, audit = true, account = true } = {}) {
  const statements = [];
  const client = {
    async query(text, params = []) {
      statements.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("FROM client_accounts")) return { rows: account ? [{ id: params[0] }] : [] };
      if (text.includes("ext_continuity_events") && text.includes("WHERE")) return { rows: [] };
      if (text.includes("INSERT INTO ext_continuity_plans")) {
        return { rows: [{ id: plan, protocol: "CONT-EXT-20261004-A1B2", status: "rascunho", origin: "ext10_canonica" }] };
      }
      if (text.includes("INSERT INTO ext_continuity_events")) return { rows: [] };
      if (text.includes("auth_access_audit")) {
        if (!audit) throw new Error("audit offline");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    statements,
    async query(text) {
      if (text.includes("FROM auth_permissions")) return { rows: permission ? [{ scope_type: "global" }] : [] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
}

const session = async () => ({ identityId: identity, role: "admin" });
const sameOrigin = () => true;
const validBody = {
  title: "Plano sintético válido",
  description: "Descrição interna suficientemente longa.",
  responsible_name: "Equipe QA",
};

test("EXT-10 migração 162 é aditiva, cria eventos imutáveis e amplia auditoria", async () => {
  const migration = await readFile(path.join(root, "db/migrations/162-ext10-continuity-canonical-journey.sql"), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(migration, /ALTER TABLE ext_continuity_plans/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_continuity_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_continuity_events/);
  for (const action of ["continuity_plan_create", "continuity_plan_update", "continuity_plan_transition_aprovado", "continuity_plan_transition_em_teste", "continuity_plan_transition_testado", "continuity_plan_transition_desatualizado", "continuity_exercise_create"]) {
    assert.match(migration, new RegExp(action));
  }
});

test("EXT-10 API expõe somente as rotas canônicas e usa guards críticos", async () => {
  const source = await readFile(path.join(root, "src/server/ext-continuity-api.mjs"), "utf8");
  assert.match(source, /continuity\.read/);
  assert.match(source, /continuity\.write/);
  assert.match(source, /continuity\.activate/);
  assert.match(source, /sameOrigin\(req\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /audit_unavailable/);
  assert.match(source, /idempotency_conflict_payload_mismatch/);
  const dispatcher = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(dispatcher, /legacy_continuity_writer_retired/);
  assert.match(dispatcher, /extContinuityApi\.handle\(req, res\)/);
});

test("EXT-10 anônimo é negado antes de qualquer conexão de mutação", async () => {
  const pool = poolForCreate();
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: async () => null });
  const res = response();
  await api.handle(req({ method: "POST", body: validBody }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(pool.statements.length, 0);
});

test("EXT-10 papel sem grant é negado mesmo quando a sessão diz admin", async () => {
  const pool = poolForCreate({ permission: false });
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: validBody }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(pool.statements.length, 0);
});

test("EXT-10 mutação cross-origin é negada antes do Idempotency-Key", async () => {
  const pool = poolForCreate();
  const api = createExtContinuityApi({ pool, sameOrigin: () => false, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", headers: { "idempotency-key": "" }, body: validBody }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(pool.statements.length, 0);
});

test("EXT-10 criação válida registra plano e evento na mesma mutação", async () => {
  const pool = poolForCreate();
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: validBody }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().plan.origin, "ext10_canonica");
  assert.ok(pool.statements.some(({ text }) => text.includes("pg_advisory_xact_lock")));
  assert.ok(pool.statements.some(({ text }) => text.includes("INSERT INTO ext_continuity_events")));
  assert.ok(pool.statements.some(({ text }) => text.includes("INSERT INTO auth_access_audit")));
});

test("EXT-10 chave de idempotência curta é rejeitada", async () => {
  const pool = poolForCreate();
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", headers: { "idempotency-key": "short" }, body: validBody }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "idempotency_key_required");
});

test("EXT-10 falha de auditoria é fail-closed e retorna 503", async () => {
  const pool = poolForCreate({ audit: false });
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: validBody }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
  assert.ok(pool.statements.some(({ text }) => text === "ROLLBACK"));
});

test("EXT-10 API isola planos por conta de cliente de forma fail-closed", async () => {
  const source = await readFile(path.join(root, "src/server/ext-continuity-api.mjs"), "utf8");
  assert.match(source, /scope_type='account' AND ap\.scope_id=p\.client_account_id/);
  assert.match(source, /client_account_not_found/);
  assert.match(source, /forbidden_account_scope/);
  assert.match(source, /invalid_client_account_id/);
  assert.match(source, /scopedPlan/);
});

test("EXT-10 client_account_id malformado é recusado antes de abrir transação", async () => {
  const pool = poolForCreate();
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { ...validBody, client_account_id: "nao-e-uuid" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_client_account_id");
  assert.equal(pool.statements.length, 0);
});

test("EXT-10 conta de cliente inexistente responde 409 e sofre rollback", async () => {
  const pool = poolForCreate({ account: false });
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { ...validBody, client_account_id: "33333333-3333-4333-8333-333333333333" } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "client_account_not_found");
  assert.ok(pool.statements.some(({ text }) => text === "ROLLBACK"));
  assert.ok(!pool.statements.some(({ text }) => text.includes("INSERT INTO ext_continuity_plans")));
});

test("EXT-10 criação com conta existente vincula client_account_id na mesma transação", async () => {
  const pool = poolForCreate();
  const api = createExtContinuityApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { ...validBody, client_account_id: "33333333-3333-4333-8333-333333333333" } }), res);
  assert.equal(res.statusCode, 201);
  const insert = pool.statements.find(({ text }) => text.includes("INSERT INTO ext_continuity_plans"));
  assert.ok(insert);
  assert.ok(insert.params.includes("33333333-3333-4333-8333-333333333333"));
  assert.ok(pool.statements.some(({ text }) => text.includes("FROM client_accounts")));
});

test("EXT-10 UI declara gate de autorização e fronteira interna", async () => {
  const page = await readFile(path.join(root, "src/app/admin/continuidade/page.tsx"), "utf8");
  const workspace = await readFile(path.join(root, "src/app/admin/continuidade/ContinuityWorkspace.tsx"), "utf8");
  assert.match(page, /AdminGate/);
  assert.match(page, /allowedRoles=\{\["admin","ti","marcelo","operacao","supervisor"\]\}/);
  assert.match(workspace, /não envia alertas externos/);
  assert.match(workspace, /\/api\/ext\/continuity\/plans/);
  assert.match(workspace, /client_account_id/);
  assert.match(workspace, /escopo por conta de cliente/);
});
