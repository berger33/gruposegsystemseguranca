// EXT-07 — teste focal (sem PostgreSQL real): migração 154 aditiva, correção de
// bugs da 153 e contrato HTTP imediato (401/403/same-origin/corpo/idempotência)
// exercitado diretamente contra o módulo com um pool falso. A prova ponta a
// ponta com PostgreSQL real está em tests/ext07-compliance.integration.test.mjs
// e no gate scripts/qa-ext07-compliance-postgres.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createExtComplianceApi } from "../src/server/ext-compliance-api.mjs";

const id = "11111111-1111-4111-8111-111111111111";
function res() {
  return { status: 0, headers: {}, payload: null, writeHead(s, h) { this.status = s; this.headers = h || {}; }, end(v) { this.payload = v ? JSON.parse(v) : null; } };
}
function req(method = "GET", path = "/api/ext/compliance/obligations", { body, origin = "https://app.invalid", host = "app.invalid", key } = {}) {
  const bytes = body !== undefined ? [Buffer.from(JSON.stringify(body))] : [];
  const headers = { origin, host };
  if (method !== "GET" && key !== null) headers["idempotency-key"] = key || "chave-sintetica-00000001";
  return { method, url: path, headers, async *[Symbol.asyncIterator]() { yield* bytes; } };
}
const emptyPool = { query: async () => ({ rows: [] }) };

test("EXT-07 migração 154 é aditiva e corrige a versão atual/responsável/fail-closed da 153", async () => {
  const sql = await readFile(new URL("../db/migrations/154-ext07-compliance-hardening.sql", import.meta.url), "utf8");
  for (const token of [
    "ALTER TABLE ext_compliance_tasks ALTER COLUMN responsible_identity SET NOT NULL",
    "ext_compliance_expiry_after_issue_check",
    "superseded_at",
    "ext_compliance_document_state_guard",
    "ext_compliance_replacement_of_unique",
    "DROP INDEX IF EXISTS ext_compliance_current_version_unique",
  ]) assert.match(sql, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /CREATE TABLE/i);
  assert.doesNotMatch(sql, /INSERT INTO ext_compliance/i);
});

test("EXT-07 migração 153 permanece intocada e preserva o legado 086", async () => {
  const sql = await readFile(new URL("../db/migrations/153-ext07-compliance-journey.sql", import.meta.url), "utf8");
  assert.match(sql, /registro_legado/);
  assert.match(sql, /ext07_canonica/);
  assert.doesNotMatch(sql, /CREATE TABLE ext_compliance_documents/);
});

test("EXT-07 staff anônimo recebe 401 e a resposta é sempre concluída", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => null });
  const r = res();
  await api.handle(req("GET", "/api/ext/compliance/obligations"), r);
  assert.equal(r.status, 401);
  assert.equal(r.payload.error, "unauthorized");
});

test("EXT-07 papel autenticado não autorizado recebe 403 (distinto de 401)", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => ({ identityId: id, role: "rh" }) });
  const r = res();
  await api.handle(req("GET", "/api/ext/compliance/obligations"), r);
  assert.equal(r.status, 403);
});

test("EXT-07 mutação fora da mesma origem recebe 403 antes de tocar o banco", async () => {
  let touched = false;
  const api = createExtComplianceApi({
    pool: { query: async () => { touched = true; return { rows: [] }; } },
    sameOrigin: () => false,
    requireSession: async () => ({ identityId: id, role: "ti" }),
  });
  const r = res();
  await api.handle(req("POST", "/api/ext/compliance/obligations", { body: { title: "x" }, origin: "https://attacker.invalid" }), r);
  assert.equal(r.status, 403);
  assert.equal(touched, false);
});

test("EXT-07 chave de idempotência é obrigatória em mutação", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => ({ identityId: id, role: "ti" }) });
  const r = res();
  await api.handle(req("POST", "/api/ext/compliance/obligations", { body: { title: "x" }, key: null }), r);
  assert.equal(r.status, 400);
});

test("EXT-07 JSON inválido recebe 400 sem consumir o corpo duas vezes", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => ({ identityId: id, role: "ti" }) });
  const r = res();
  const malformed = {
    method: "POST", url: "/api/ext/compliance/obligations",
    headers: { origin: "https://app.invalid", host: "app.invalid", "idempotency-key": "chave-sintetica-00000002" },
    async *[Symbol.asyncIterator]() { yield Buffer.from("{nao-e-json"); },
  };
  await api.handle(malformed, r);
  assert.equal(r.status, 400);
});

test("EXT-07 corpo grande recebe 413", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => ({ identityId: id, role: "ti" }) });
  const r = res();
  const big = {
    method: "POST", url: "/api/ext/compliance/obligations",
    headers: { origin: "https://app.invalid", host: "app.invalid", "idempotency-key": "chave-sintetica-00000003" },
    async *[Symbol.asyncIterator]() { yield Buffer.alloc(40000, 65); },
  };
  await api.handle(big, r);
  assert.equal(r.status, 413);
});

test("EXT-07 UUID inválido no caminho recebe 400 (não 404 silencioso)", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => ({ identityId: id, role: "ti" }) });
  const r = res();
  await api.handle(req("GET", "/api/ext/compliance/obligations/00000000-0000-0000-0000-000000000000"), r);
  assert.equal(r.status, 400);
});

test("EXT-07 rota de tarefa desconhecida recebe 404 e método incorreto recebe 405", async () => {
  const api = createExtComplianceApi({ pool: emptyPool, sameOrigin: () => true, requireSession: async () => ({ identityId: id, role: "ti" }) });
  let r = res();
  await api.handle(req("GET", "/api/ext/compliance/unknown"), r);
  assert.equal(r.status, 404);
  r = res();
  await api.handle(req("DELETE", "/api/ext/compliance/obligations"), r);
  assert.equal(r.status, 405);
});

test("EXT-07 UI preserva chave de retry e declara a fronteira documental", async () => {
  const ui = await readFile(new URL("../src/app/admin/compliance/ComplianceWorkspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /keys\.current\[name\] = key/);
  assert.match(ui, /não representa upload, bytes, checksum/);
  assert.match(ui, /relógio do navegador nunca decide/);
});

test("EXT-07 server.mjs liga a API canônica e preserva legado com 410 na escrita", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /createExtComplianceApi/);
  assert.match(server, /\/api\/ext\/compliance\//);
  assert.match(server, /legacy_writer_retired/);
  // Regressão real: a 153 ligou o handler em routeApi() mas esqueceu de
  // incluir "/api/ext/compliance/" no allowlist API_PATH_MATCH que decide se
  // routeApi() é sequer chamado — toda requisição real caía no 404 do Next.js
  // sem jamais alcançar o handler. Um grep solto no caminho dentro do
  // dispatcher não detectava isto; é preciso confirmar que o MESMO trecho que
  // define o allowlist contém o prefixo canônico.
  const matchBlock = server.match(/const API_PATH_MATCH = pathname =>[\s\S]*?;\n/);
  assert.ok(matchBlock, "API_PATH_MATCH não encontrado em server.mjs");
  assert.match(matchBlock[0], /pathname\.startsWith\("\/api\/ext\/compliance\/"\)/);
});
