// F15 — caixa interna de pendências: contratos estáticos e guards sem banco real.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createOpsPendencyApi } from "../src/server/ops-pendency-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
const identity = "11111111-1111-4111-8111-111111111111";
const pendency = "22222222-2222-4222-8222-222222222222";

function req({ method = "GET", url = "/api/ops/pendencies", body, headers = {} } = {}) {
  const stream = (async function* () {
    if (body !== undefined) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  })();
  stream.method = method;
  stream.url = url;
  stream.headers = { origin: "https://seg.test", host: "seg.test", "idempotency-key": "pendency-unit-key-01", ...headers };
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

function poolFor({ permission = true, audit = true, rows = [], owned = true, status = "nao_lida" } = {}) {
  const statements = [];
  const client = {
    async query(text, params = []) {
      statements.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("FROM ops_pendency_notifications WHERE id=$1")) {
        return { rows: owned ? [{ id: pendency, status, recipient_identity: identity }] : [] };
      }
      if (text.includes("INSERT INTO ops_pendency_notifications")) return { rows: [{ id: pendency }] };
      if (text.includes("UPDATE ops_pendency_notifications")) return { rows: [{ id: pendency, status: "lida" }] };
      if (text.includes("auth_access_audit")) {
        if (!audit) throw new Error("audit offline");
        return { rows: [] };
      }
      if (text.includes("FROM ext_compliance_obligations")) return { rows };
      if (text.includes("FROM ext_compliance_action_plans")) return { rows: [] };
      if (text.includes("FROM ext_compliance_tasks")) return { rows: [] };
      if (text.includes("FROM ext_continuity_plans")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  return {
    statements,
    async query(text) {
      if (text.includes("FROM auth_permissions")) return { rows: permission ? [{ "?column?": 1 }] : [] };
      if (text.includes("FROM ops_pendency_notifications")) return { rows: [{ id: pendency, status: "nao_lida" }] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
}

const session = async () => ({ identityId: identity, role: "admin" });
const sameOrigin = () => true;

test("F15 migração 170 é aditiva, nasce fail-closed e amplia a auditoria", async () => {
  const migration = await readFile(path.join(root, "db/migrations/170-ops-internal-pendency-notifications.sql"), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ops_pendency_notifications/);
  assert.match(migration, /cannot be physically deleted/);
  assert.match(migration, /is born nao_lida/);
  assert.match(migration, /requires an active staff recipient/);
  assert.match(migration, /archived internal pendency notification is immutable/);
  assert.match(migration, /requires a justification/);
  assert.match(migration, /ops_pendency_notifications_dedup_key/);
  for (const action of ["ops_pendency_sweep", "ops_pendency_read", "ops_pendency_archive"]) {
    assert.match(migration, new RegExp(action));
  }
});

test("F15 não reutiliza a fila legada nem qualquer canal externo", async () => {
  const source = await readFile(path.join(root, "src/server/ops-pendency-api.mjs"), "utf8");
  // Comentários podem citar o que a fatia NÃO faz; o código executável não pode conter nada disso.
  const code = source.replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/notification_queue/i, /mailer/i, /smtp/i, /sendMail/i, /whatsapp/i, /webhook/i, /\bsms\b/i]) {
    assert.doesNotMatch(code, forbidden);
  }
  const workspace = await readFile(path.join(root, "src/app/admin/pendencias/PendencyWorkspace.tsx"), "utf8");
  assert.match(workspace, /não envia e-mail, SMS, WhatsApp, push ou webhook/);
  const page = await readFile(path.join(root, "src/app/admin/pendencias/page.tsx"), "utf8");
  assert.match(page, /AdminGate/);
});

test("F15 anônimo é negado antes de qualquer consulta", async () => {
  const pool = poolFor();
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: async () => null });
  const res = response();
  await api.handle(req({ method: "POST", url: "/api/ops/pendencies/sweep", body: {} }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(pool.statements.length, 0);
});

test("F15 varredura cross-origin é negada antes da permissão e da chave", async () => {
  const pool = poolFor();
  const api = createOpsPendencyApi({ pool, sameOrigin: () => false, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: "/api/ops/pendencies/sweep", body: {} }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "origin_forbidden");
  assert.equal(pool.statements.length, 0);
});

test("F15 varredura exige a permissão pendency.sweep", async () => {
  const pool = poolFor({ permission: false });
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: "/api/ops/pendencies/sweep", body: {} }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "forbidden");
  assert.ok(!pool.statements.some(({ text }) => text === "BEGIN"));
});

test("F15 varredura idempotente usa ON CONFLICT DO NOTHING e lock por chave", async () => {
  const pool = poolFor({ rows: [{ id: pendency, responsible_identity: identity, title: "Obrigação sintética", criticality: "alta", due_date: null, source_state: "vencida" }] });
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: "/api/ops/pendencies/sweep", body: {} }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().total, 1);
  const insert = pool.statements.find(({ text }) => text.includes("INSERT INTO ops_pendency_notifications"));
  assert.match(insert.text, /ON CONFLICT \(recipient_identity,source_module,source_id,source_fingerprint\) DO NOTHING/);
  assert.ok(pool.statements.some(({ text }) => text.includes("pg_advisory_xact_lock")));
  assert.ok(pool.statements.some(({ text }) => text.includes("auth_access_audit")));
});

test("F15 varredura só materializa origem com responsável staff ativo", async () => {
  const source = await readFile(path.join(root, "src/server/ops-pendency-api.mjs"), "utf8");
  const joins = source.match(/JOIN auth_identities i ON i\.id = \w+\.responsible_identity AND i\.kind='staff' AND i\.status='active'/g) || [];
  assert.equal(joins.length, 4, "as quatro fontes precisam exigir responsável staff ativo");
  assert.equal((source.match(/JOIN auth_staff_profiles sp/g) || []).length, 4);
});

test("F15 chave de idempotência curta é rejeitada na varredura", async () => {
  const pool = poolFor();
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: "/api/ops/pendencies/sweep", headers: { "idempotency-key": "curta" }, body: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "idempotency_key_required");
});

test("F15 falha de auditoria é fail-closed com rollback e 503", async () => {
  const pool = poolFor({ audit: false, rows: [] });
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: "/api/ops/pendencies/sweep", body: {} }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
  assert.ok(pool.statements.some(({ text }) => text === "ROLLBACK"));
});

test("F15 caixa é pessoal: a listagem filtra sempre pela identidade da sessão", async () => {
  const captured = [];
  const pool = {
    statements: [],
    async query(text, params) { captured.push({ text, params }); return { rows: [] }; },
    async connect() { throw new Error("list must not open a transaction"); },
  };
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ url: "/api/ops/pendencies?status=nao_lida" }), res);
  assert.equal(res.statusCode, 200);
  const listed = captured.find(({ text }) => text.includes("FROM ops_pendency_notifications"));
  assert.match(listed.text, /n\.recipient_identity=\$1/);
  assert.equal(listed.params[0], identity);
});

test("F15 pendência de outra identidade responde 404 sem revelar existência", async () => {
  const pool = poolFor({ owned: false });
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: `/api/ops/pendencies/${pendency}/read`, body: {} }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "pendency_not_found");
  const select = pool.statements.find(({ text }) => text.includes("FROM ops_pendency_notifications WHERE id=$1"));
  assert.match(select.text, /recipient_identity=\$2/);
  assert.match(select.text, /FOR UPDATE/);
});

test("F15 arquivamento sem justificativa é recusado antes da transação", async () => {
  const pool = poolFor();
  const api = createOpsPendencyApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", url: `/api/ops/pendencies/${pendency}/archive`, body: { note: "curta" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "archive_note_required");
  assert.ok(!pool.statements.some(({ text }) => text === "BEGIN"));
});

test("F15 rotas desconhecidas e métodos inválidos falham fechados", async () => {
  const api = createOpsPendencyApi({ pool: poolFor(), sameOrigin, requireSession: session });
  const notFound = response();
  await api.handle(req({ url: "/api/ops/pendencies/inventado/enviar" }), notFound);
  assert.equal(notFound.statusCode, 404);
  const wrongMethod = response();
  await api.handle(req({ method: "DELETE", url: "/api/ops/pendencies" }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  const dispatcher = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(dispatcher, /opsPendencyApi\.handle\(req, res\)/);
  assert.match(dispatcher, /pathname === "\/api\/ops\/pendencies"/);
});
