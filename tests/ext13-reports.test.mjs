// EXT-13 / F09 — contrato estático e unitário do relatório periódico canônico.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPORT_SOURCES, buildTotalsSnapshot, createExtReportsApi } from "../src/server/ext-reports-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
const identity = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";

function req({ method = "GET", url = "/api/ext/reports/periodic", body, headers = {} } = {}) {
  const stream = (async function* () {
    if (body !== undefined) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  })();
  stream.method = method;
  stream.url = url;
  stream.headers = { origin: "https://seg.test", host: "seg.test", "idempotency-key": "ext13-unit-key-001", ...headers };
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

function poolForCreate({ permission = true, audit = true } = {}) {
  const statements = [];
  const client = {
    async query(text, params = []) {
      statements.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("FROM ext_report_events") && text.includes("FOR UPDATE")) return { rows: [] };
      if (text.includes("INSERT INTO ext_periodic_reports")) {
        return { rows: [{ id: reportId, protocol: "RELP-EXT-20261004-ABCD", title: "Relatório mensal comercial", report_type: "comercial", status: "rascunho", origin: "ext13_canonica" }] };
      }
      if (text.includes("INSERT INTO ext_report_events")) return { rows: [] };
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
      if (text.includes("FROM auth_permissions")) return { rows: permission ? [{ scope_type: "global", scope_id: null }] : [] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
}

const session = async () => ({ identityId: identity, role: "admin" });
const sameOrigin = () => true;

const reportPayload = {
  title: "Relatório mensal comercial",
  report_type: "comercial",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  recipient_emails: ["staff.ext13@example.invalid"],
  change_summary: "Definição unitária do relatório periódico",
};

test("EXT-13 migração 165 é aditiva e cria eventos de relatório imutáveis", async () => {
  const migration = await readFile(path.join(root, "db/migrations/165-ext13-reports-canonical-journey.sql"), "utf8");
  assert.match(migration, /ALTER TABLE ext_periodic_reports/);
  assert.match(migration, /origin IN \('registro_legado', 'ext13_canonica'\)/);
  assert.match(migration, /ALTER TYPE ext_report_status ADD VALUE IF NOT EXISTS 'envio_registrado'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_report_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_report_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_periodic_report_logs/);
  assert.match(migration, /reports\.send/);
  // Aditiva: nenhuma reescrita retroativa de dados legados.
  assert.doesNotMatch(migration, /UPDATE ext_periodic_reports\s/);
  assert.doesNotMatch(migration, /DELETE FROM ext_periodic_reports/);
});

test("EXT-13 fontes por tipo são tabelas internas reais e fixas", () => {
  assert.deepEqual(Object.keys(REPORT_SOURCES).sort(), ["comercial", "compliance", "financeiro", "operacional", "qualidade", "satisfacao"]);
  assert.deepEqual([...REPORT_SOURCES.financeiro], ["fin_accounts_receivable", "fin_payments"]);
  assert.deepEqual([...REPORT_SOURCES.comercial], ["public_leads", "crm_contacts"]);
});

test("EXT-13 snapshot de totais é rastreável por fonte e declara fronteira", () => {
  const totals = buildTotalsSnapshot({
    reportType: "financeiro",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    counts: { fin_accounts_receivable: 3, fin_payments: 2 },
  });
  assert.deepEqual(totals.sources, { fin_accounts_receivable: 3, fin_payments: 2 });
  assert.equal(totals.total_records, 5);
  assert.match(totals.boundary, /não envia e-mail/);
  assert.match(totals.method, /COUNT/);
});

test("EXT-13 anônimo é negado fail-closed antes de escrita", async () => {
  const pool = poolForCreate();
  const api = createExtReportsApi({ pool, sameOrigin, requireSession: async () => null });
  const res = response();
  await api.handle(req({ method: "POST", body: reportPayload }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(pool.statements.length, 0);
});

test("EXT-13 ausência de permissão é negada mesmo com papel admin", async () => {
  const pool = poolForCreate({ permission: false });
  const api = createExtReportsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: reportPayload }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(pool.statements.length, 0);
});

test("EXT-13 criação exige Idempotency-Key e grava fingerprint, lock e evento", async () => {
  const pool = poolForCreate();
  const api = createExtReportsApi({ pool, sameOrigin, requireSession: session });
  const missing = response();
  await api.handle(req({ method: "POST", headers: { "idempotency-key": "" }, body: reportPayload }), missing);
  assert.equal(missing.statusCode, 400);

  const ok = response();
  await api.handle(req({ method: "POST", body: reportPayload }), ok);
  assert.equal(ok.statusCode, 201);
  const sql = pool.statements.map((item) => item.text).join("\n");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /INSERT INTO ext_report_events/);
  assert.match(sql, /auth_access_audit/);
});

test("EXT-13 tipo sem fonte interna confirmada é recusado", async () => {
  const pool = poolForCreate();
  const api = createExtReportsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: { ...reportPayload, report_type: "outro" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_report_type");
});

test("EXT-13 falha de auditoria responde 503 e faz rollback sem commit", async () => {
  const pool = poolForCreate({ audit: false });
  const api = createExtReportsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: reportPayload }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
  const sql = pool.statements.map((item) => item.text);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(sql.includes("COMMIT"), false);
});

test("EXT-13 mutação fora de same-origin é recusada", async () => {
  const pool = poolForCreate();
  const api = createExtReportsApi({ pool, sameOrigin: () => false, requireSession: session });
  const res = response();
  await api.handle(req({ method: "POST", body: reportPayload }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "origin_forbidden");
});

test("EXT-13 escrita legada retorna 410 depois das guardas", async () => {
  const pool = poolForCreate();
  const api = createExtReportsApi({ pool, sameOrigin, requireSession: session });
  const res = response();
  await api.handleLegacy(req({ method: "POST", url: "/api/ext/periodic-reports", body: reportPayload }), res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.json().canonical, "/api/ext/reports/periodic");
});

test("EXT-13 servidor registra borda canônica e aposentadoria legada", async () => {
  const server = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(server, /createExtReportsApi/);
  assert.match(server, /pathname\.startsWith\("\/api\/ext\/reports\/"\)/);
  assert.match(server, /extReportsApi\.handleLegacy/);
  assert.doesNotMatch(server, /extReportingApi\.handlePeriodicReports/);
});

test("EXT-13 UI é AdminGate e declara envio registrado sem SMTP", async () => {
  const page = await readFile(path.join(root, "src/app/admin/relatorios/page.tsx"), "utf8");
  const workspace = await readFile(path.join(root, "src/app/admin/relatorios/ReportsWorkspace.tsx"), "utf8");
  assert.match(page, /AdminGate/);
  assert.match(page, /ReportsWorkspace/);
  assert.match(workspace, /não usa os handlers legados como cobertura/);
  assert.match(workspace, /Idempotency-Key/);
  assert.match(workspace, /registro interno autorizado/);
});
