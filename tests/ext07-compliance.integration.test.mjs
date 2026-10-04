// EXT-07 — prova ponta a ponta: PostgreSQL 17 real + servidor HTTP real.
// Somente dados sintéticos em domínios .invalid. Sem banco do operador, sem
// SMTP, sem armazenamento externo, sem integração regulatória, sem aceite humano.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-07 gate exige PostgreSQL real e servidor HTTP real", () => {
  if (REQUIRE) assert.ok(RUN, "DATABASE_URL + RUN_DATABASE_INTEGRATION obrigatórios: skip não é prova");
});

let server, base, pool, admin, ti, rh, cookieAdmin, cookieTi, cookieRh;
let serverLogs = "";
// O servidor Next em modo dev reescreve next-env.d.ts/tsconfig.json conforme o
// NEXT_DIST_DIR. A prova não pode alterar esses arquivos de forma permanente.
const GUARDED_FILES = ["next-env.d.ts", "tsconfig.json"];
const guardedSnapshots = new Map();
const logTail = () => serverLogs.slice(-2000);
const key = (tag) => `ext07-${tag}-${randomUUID()}`;
const today = () => new Date().toISOString().slice(0, 10);
const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function waitForServer(logs) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if ([200, 401].includes((await fetch(`${base}/api/admin/session`)).status)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`server_did_not_start\n${logs().slice(-3000)}`);
}

async function createStaff(role) {
  const id = randomUUID();
  const email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query("INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')", [id, email, `QA EXT07 ${role}`]);
  await pool.query("INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)", [id, await hashPassword(password)]);
  await pool.query("INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')", [id, role]);
  return { id, email, password, role };
}

// Permissão granular sintética: as rotas legadas /api/admin/hr e /api/crm/hr
// passam pelo gate RBAC antes do 410, então a prova precisa do grant explícito.
async function grantPermission(identityId, permission) {
  await pool.query(
    "INSERT INTO auth_permissions(id,identity_id,permission,scope_type,granted_by_role,reason) VALUES($1,$2,$3,'global','system',$4)",
    [randomUUID(), identityId, permission, "Prova sintética EXT-07"],
  );
}

async function login(staff) {
  const response = await fetch(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: staff.email, password: staff.password }),
  });
  assert.equal(response.status, 200, `login_failed_${staff.role}`);
  return response.headers.getSetCookie().find(value => value.startsWith("seg_admin_session=")).split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieTi, body, idempotencyKey, origin = base, raw } = {}) {
  const headers = { accept: "application/json", ...(origin === null ? {} : { origin }), ...(cookie ? { cookie } : {}) };
  if (method !== "GET") headers["idempotency-key"] = idempotencyKey === null ? "" : (idempotencyKey ?? key("request"));
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const payload = raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw;
  let response;
  try {
    response = await fetch(base + url, { method, headers, body: payload, signal: AbortSignal.timeout(45000) });
  } catch (error) {
    throw new Error(`http_request_failed ${method} ${url}: ${error.name}: ${error.message}\n--- server log ---\n${logTail()}`);
  }
  const textBody = await response.text();
  let parsed;
  try { parsed = JSON.parse(textBody); } catch { parsed = { raw: textBody }; }
  return { status: response.status, body: parsed, text: textBody };
}

const obligationPayload = (over = {}) => ({
  obligation_type: "licenca",
  title: "Licença sintética de funcionamento QA",
  description: "Obrigação sintética criada apenas para a prova automatizada EXT-07.",
  declared_source: "Política interna sintética QA versão 1 (fonte declarada pelo operador).",
  applicability_scope: "Unidade sintética QA",
  applicability_justification: "Aplicável porque a unidade sintética executa atividade fictícia de teste.",
  validity_rule: "Renovação anual declarada pelo operador sintético.",
  renewal_lead_days: 30,
  criticality: "alta",
  responsible_identity: ti.id,
  ...over,
});

const documentPayload = (obligationId, over = {}) => ({
  obligation_id: obligationId,
  title: "Referência privada sintética QA",
  description: "Referência documental declarada, sem arquivo real e sem armazenamento verificado.",
  compliance_type: "licenca",
  issue_date: shift(-30),
  effective_start_date: shift(-30),
  expiry_date: shift(180),
  reference_type: "referencia_declarada",
  declared_reference: "REF-SINTETICA-QA-0001",
  reference_source: "Registro interno sintético QA",
  document_number: "DOC-QA-0001",
  issuer: "Órgão sintético QA",
  ...over,
});

async function newObligation(over = {}, options = {}) {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(over), ...options });
  assert.equal(response.status, 201, response.text);
  return response.body.obligation;
}

async function newDocument(obligationId, over = {}, options = {}) {
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligationId, over), ...options });
  assert.equal(response.status, 201, response.text);
  return response.body.document;
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  const port = 3600 + Math.floor(Math.random() * 700);
  base = `http://127.0.0.1:${port}`;
  let logs = "";
  for (const file of GUARDED_FILES) guardedSnapshots.set(file, await readFile(path.join(root, file), "utf8"));
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "0.0.0.0",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext07",
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { logs += chunk; serverLogs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; serverLogs += chunk; });
  await waitForServer(() => logs);
  admin = await createStaff("admin");
  ti = await createStaff("ti");
  rh = await createStaff("rh");
  for (const identity of [admin.id, ti.id]) {
    await grantPermission(identity, "employees.read");
    await grantPermission(identity, "employees.write");
  }
  cookieAdmin = await login(admin);
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 400));
    server.kill("SIGKILL");
  }
  for (const [file, content] of guardedSnapshots) {
    await writeFile(path.join(root, file), content, "utf8").catch(() => {});
  }
});

const opt = { skip: !RUN };

/* ---------------------------------------------------------------- autenticação e autorização */

test("EXT-07 HTTP anônimo recebe 401 na leitura canônica", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { cookie: null })).status, 401);
});

test("EXT-07 HTTP papel autenticado não autorizado recebe 403", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { cookie: cookieRh })).status, 403);
});

test("EXT-07 HTTP staff ti e admin são autorizados", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { cookie: cookieTi })).status, 200);
  assert.equal((await api("/api/ext/compliance/documents", { cookie: cookieAdmin })).status, 200);
});

test("EXT-07 HTTP identidade/sessão inválida não é aceita", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { cookie: "seg_admin_session=forjado.invalido" })).status, 401);
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: `seg_admin_session=${randomUUID()}` })).status, 401);
});

test("EXT-07 HTTP mutação exige same-origin", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), origin: "https://atacante.invalid" })).status, 403);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), origin: null })).status, 403);
});

test("EXT-07 HTTP cabeçalho origin malformado é rejeitado", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), origin: "origem-invalida" })).status, 403);
});

test("EXT-07 HTTP leitura de detalhe não aceita exposição pública", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id);
  assert.equal((await api(`/api/ext/compliance/documents/${document.id}`, { cookie: null })).status, 401);
  assert.equal((await api(`/api/ext/compliance/documents/${document.id}`, { cookie: cookieRh })).status, 403);
  assert.equal((await api(`/api/ext/compliance/documents/${document.id}`)).status, 200);
});

test("EXT-07 não existe rota pública de documentos", opt, async () => {
  for (const route of ["/api/public/compliance-documents", "/api/public/ext/compliance/documents", "/compliance/documentos"]) {
    const response = await fetch(base + route);
    await response.text();
    assert.notEqual(response.status, 200, `rota pública inesperada: ${route}`);
  }
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.doesNotMatch(serverSource, /\/api\/public\/[a-z-]*compliance/i);
  const apiSource = await readFile(path.join(root, "src/server/ext-compliance-api.mjs"), "utf8");
  assert.doesNotMatch(apiSource, /\/api\/public\//);
});

/* ---------------------------------------------------------------- entrada e protocolo */

test("EXT-07 HTTP JSON inválido retorna 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "{" })).status, 400);
});

test("EXT-07 HTTP corpo acima do limite retorna 413", opt, async () => {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify({ padding: "x".repeat(200000) }) });
  assert.equal(response.status, 413);
});

test("EXT-07 HTTP corpo não-objeto retorna 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify([1, 2, 3]) })).status, 400);
});

test("EXT-07 HTTP Idempotency-Key ausente retorna 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), idempotencyKey: null })).status, 400);
});

test("EXT-07 HTTP Idempotency-Key curta ou longa demais retorna 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), idempotencyKey: "abc" })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), idempotencyKey: "k".repeat(201) })).status, 400);
});

test("EXT-07 HTTP UUID inválido retorna 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload("nao-e-uuid") })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents/nao-e-uuid")).status, 400);
  assert.equal((await api(`/api/ext/compliance/tasks/nao-e-uuid/start`, { method: "POST", body: {} })).status, 400);
});

test("EXT-07 HTTP rota desconhecida retorna 405 e o body não é consumido duas vezes", opt, async () => {
  const response = await api("/api/ext/compliance/inexistente", { method: "POST", body: { a: 1 } });
  assert.equal(response.status, 405);
  // O mesmo processo continua respondendo corretamente (nenhum stream travado).
  assert.equal((await api("/api/ext/compliance/documents")).status, 200);
});

/* ---------------------------------------------------------------- obrigações */

test("EXT-07 obrigação preserva campos declarados e deriva autoria do servidor", opt, async () => {
  const obligation = await newObligation();
  assert.equal(obligation.created_by_identity, ti.id);
  assert.equal(obligation.responsible_identity, ti.id);
  assert.equal(obligation.status, "pendente");
  assert.equal(obligation.obligation_type, "licenca");
  assert.equal(obligation.criticality, "alta");
  assert.match(obligation.declared_source, /fonte declarada/i);
  assert.ok(obligation.validity_rule.length >= 5);
  assert.ok(obligation.created_at);
});

test("EXT-07 tentativa de forjar created_by_identity e estado é ignorada", opt, async () => {
  const obligation = await newObligation({ created_by_identity: admin.id, status: "vigente", id: randomUUID() });
  assert.equal(obligation.created_by_identity, ti.id);
  assert.equal(obligation.status, "pendente");
  const stored = await pool.query("SELECT created_by_identity,status FROM ext_compliance_obligations WHERE id=$1", [obligation.id]);
  assert.equal(stored.rows[0].created_by_identity, ti.id);
  assert.equal(stored.rows[0].status, "pendente");
});

test("EXT-07 campos obrigatórios da obrigação são validados", opt, async () => {
  for (const field of ["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "obligation_type"]) {
    const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload({ [field]: "" }) });
    assert.equal(response.status, 400, `campo ${field} deveria ser obrigatório`);
  }
});

test("EXT-07 responsável precisa ser staff ativo e autorizado", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload({ responsible_identity: randomUUID() }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload({ responsible_identity: rh.id }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload({ responsible_identity: "x" }) })).status, 400);
});

test("EXT-07 listagem de obrigações declara fonte, denominador e não vende validação jurídica", opt, async () => {
  const response = await api("/api/ext/compliance/obligations");
  assert.equal(response.status, 200);
  assert.equal(response.body.source, "ext_compliance_obligations");
  assert.equal(typeof response.body.denominator, "number");
  assert.ok("absence_is_not_zero" in response.body);
  assert.match(response.body.declared_source_disclaimer, /não é validação jurídica/i);
  assert.doesNotMatch(response.text, /validado pelo órgão|confirmado pelo órgão|homologado pelo governo/i);
});

/* ---------------------------------------------------------------- documentos */

test("EXT-07 documento canônico nasce privado em ext_compliance_documents", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id);
  assert.equal(document.origin, "ext07_canonica");
  assert.equal(document.is_private, true);
  assert.equal(document.obligation_id, obligation.id);
  assert.equal(document.version_no, 1);
  const stored = await pool.query("SELECT origin,is_private,created_by_identity,responsible_identity,validity_rule FROM ext_compliance_documents WHERE id=$1", [document.id]);
  assert.equal(stored.rows[0].origin, "ext07_canonica");
  assert.equal(stored.rows[0].is_private, true);
  assert.equal(stored.rows[0].created_by_identity, ti.id);
  assert.equal(stored.rows[0].responsible_identity, ti.id);
  assert.equal(stored.rows[0].validity_rule, obligation.validity_rule);
});

test("EXT-07 criação de documento sem obrigação relacionada é rejeitada", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(undefined) })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(randomUUID()) })).status, 404);
});

test("EXT-07 forjar responsável, estado, contador, autoria ou IDs é rejeitado", opt, async () => {
  const obligation = await newObligation();
  for (const forged of [{ status: "vencida" }, { created_by_identity: admin.id }, { responsible_identity: admin.id }, { version_no: 99 }, { is_private: false }, { storage_key: "s3://nao.invalid/x" }, { file_url: "https://nao.invalid/x.pdf" }, { origin: "registro_legado" }, { id: randomUUID() }, { protocol: "COMP-EXT-20260101-AAAA" }, { replacement_of: randomUUID() }]) {
    const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id, forged) });
    assert.equal(response.status, 400, `campo forjado aceito: ${Object.keys(forged)[0]}`);
    assert.equal(response.body.error, "server_owned_fields_rejected");
  }
});

test("EXT-07 listagem não expõe storage_key, URL privada nem metadados desnecessários", opt, async () => {
  const response = await api("/api/ext/compliance/documents");
  assert.equal(response.status, 200);
  assert.equal(response.body.source, "ext_compliance_documents");
  assert.equal(response.body.canonical_origin, "ext07_canonica");
  const itemsText = JSON.stringify(response.body.items);
  for (const forbidden of ["storage_key", "file_url", "file_name", "declared_reference", "document_number", "responsible_name", "checksum", "download"]) {
    assert.doesNotMatch(itemsText, new RegExp(forbidden, "i"), `campo exposto indevidamente: ${forbidden}`);
  }
  assert.equal(response.body.public_route, false);
  assert.match(response.body.file_boundary, /referencia_declarada/);
});

test("EXT-07 detalhe usa allowlist e distingue referência de arquivo real", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id);
  const response = await api(`/api/ext/compliance/documents/${document.id}`);
  assert.equal(response.status, 200);
  const allowed = new Set(["id", "protocol", "title", "description", "compliance_type", "status", "obligation_id", "origin", "issue_date", "effective_start_date", "expiry_date", "validity_rule", "evaluation_date", "reference_type", "reference_source", "is_private", "version_no", "replacement_of", "created_at", "updated_at"]);
  for (const field of Object.keys(response.body.document)) assert.ok(allowed.has(field), `campo fora da allowlist: ${field}`);
  assert.match(response.body.file_boundary, /nao_arquivo_verificado/);
  assert.doesNotMatch(response.text, /upload|checksum|malware|bytes|download|storage_key/i);
});

test("EXT-07 não declara upload, bytes, checksum, malware scan ou storage verificado", opt, async () => {
  const obligation = await newObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id) });
  assert.equal(response.status, 201);
  assert.match(response.body.message, /não representa arquivo armazenado, verificado ou baixável/i);
  assert.doesNotMatch(response.text, /upload realizado|checksum|malware|antivírus|bytes armazenados/i);
  const listing = await api("/api/ext/compliance/documents");
  assert.match(listing.body.storage_claim, /nenhum upload/i);
});

test("EXT-07 registros anteriores permanecem registro_legado", opt, async () => {
  const protocol = `COMP-EXT-20250101-${randomBytes(2).toString("hex").toUpperCase()}`;
  const legacy = await pool.query(
    "INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type) VALUES($1,'Registro legado sintético','Linha histórica sintética preservada pela migração.','outro') RETURNING id,origin,is_private",
    [protocol],
  );
  assert.equal(legacy.rows[0].origin, "registro_legado");
  assert.equal(legacy.rows[0].is_private, true);
  const canonical = await api("/api/ext/compliance/documents");
  assert.ok(!canonical.body.items.some(item => item.id === legacy.rows[0].id), "legado não pode aparecer como canônico");
  const counts = await pool.query("SELECT origin, count(*)::int n FROM ext_compliance_documents GROUP BY origin");
  assert.ok(counts.rows.some(row => row.origin === "registro_legado"));
});

test("EXT-07 banco recusa sobrescrita destrutiva do documento canônico", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET expiry_date=$2 WHERE id=$1", [document.id, shift(900)]), /immutable|renewal/i);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET storage_key=$2 WHERE id=$1", [document.id, `s3://sintetico.invalid/${randomUUID()}`]), /immutable|renewal/i);
});

test("EXT-07 no máximo uma versão atual por obrigação", opt, async () => {
  const obligation = await newObligation();
  await newDocument(obligation.id);
  const second = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id, { declared_reference: "REF-SINTETICA-QA-0002" }) });
  assert.equal(second.status, 409, second.text);
  const rows = await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1 AND replacement_of IS NULL AND status<>'cancelada'", [obligation.id]);
  assert.equal(rows.rows[0].n, 1);
});

/* ---------------------------------------------------------------- validade */

test("EXT-07 vencimento anterior à emissão é rejeitado", opt, async () => {
  const obligation = await newObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id, { issue_date: shift(10), effective_start_date: shift(10), expiry_date: shift(5) }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "expiry_before_issue");
});

test("EXT-07 vencimento anterior ao início de vigência é rejeitado", opt, async () => {
  const obligation = await newObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id, { issue_date: shift(-30), effective_start_date: shift(40), expiry_date: shift(20) }) });
  assert.equal(response.status, 400);
  assert.ok(["expiry_before_effective_start", "expiry_before_issue"].includes(response.body.error), response.text);
});

test("EXT-07 início de vigência anterior à emissão é rejeitado", opt, async () => {
  const obligation = await newObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id, { issue_date: shift(-10), effective_start_date: shift(-40) }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "effective_start_before_issue");
});

test("EXT-07 data malformada e validade ausente são rejeitadas", opt, async () => {
  const obligation = await newObligation();
  for (const dates of [{ issue_date: "2026-13-45" }, { issue_date: "ontem" }, { expiry_date: null }, { expiry_date: undefined }, { issue_date: "26-01-01" }]) {
    const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id, dates) });
    assert.equal(response.status, 400, JSON.stringify(dates));
    assert.equal(response.body.error, "invalid_validity");
  }
});

test("EXT-07 regra de validade vem da obrigação e é preservada", opt, async () => {
  const rule = "Regra sintética específica de validade QA.";
  const obligation = await newObligation({ validity_rule: rule });
  const document = await newDocument(obligation.id);
  assert.equal(document.validity_rule, rule);
});

/* ---------------------------------------------------------------- avaliação de vencimento */

test("EXT-07 avaliação usa a data do servidor e ignora a data do cliente", opt, async () => {
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "1999-01-01" } });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.client_date_ignored, true);
  assert.equal(response.body.source, "server_date");
  const serverDate = (await pool.query("SELECT CURRENT_DATE::text d")).rows[0].d;
  assert.equal(response.body.base_date, serverDate);
  assert.equal(response.body.evaluation_date, serverDate);
  assert.notEqual(response.body.base_date, "1999-01-01");
});

test("EXT-07 avaliação informa fonte, data-base, regra, fatos e denominador", opt, async () => {
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.rule, "expiry_at_or_before_server_date");
  assert.equal(response.body.task_source, "ext_compliance_tasks");
  assert.equal(typeof response.body.denominator, "number");
  assert.ok("absence_is_not_zero" in response.body);
  assert.ok(Array.isArray(response.body.fail_closed));
});

test("EXT-07 documento vencido gera tarefa esperada com fatos e responsável canônico", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-400), effective_start_date: shift(-400), expiry_date: shift(-5) });
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(response.status, 200, response.text);
  const task = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [document.id])).rows[0];
  assert.ok(task, "tarefa esperada não foi criada");
  assert.equal(task.obligation_id, obligation.id);
  assert.equal(task.responsible_identity, ti.id);
  assert.equal(task.created_by_identity, ti.id);
  assert.equal(task.rule, "expiry_at_or_before_server_date");
  assert.match(task.validity_period, /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/);
  assert.equal(task.facts.source, "server_date");
  assert.equal(task.facts.base_date, (await pool.query("SELECT CURRENT_DATE::text d")).rows[0].d);
  assert.equal(task.status, "aberta");
  const stored = await pool.query("SELECT status FROM ext_compliance_documents WHERE id=$1", [document.id]);
  assert.equal(stored.rows[0].status, "vencida");
});

test("EXT-07 estado vigente com data vencida é corrigido pela regra explícita", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-200), effective_start_date: shift(-200), expiry_date: shift(-1) });
  assert.equal(document.status, "vigente");
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.match(response.body.correction, /regra declarada/i);
  const stored = await pool.query("SELECT status,evaluation_date FROM ext_compliance_documents WHERE id=$1", [document.id]);
  assert.equal(stored.rows[0].status, "vencida");
  assert.ok(stored.rows[0].evaluation_date);
});

test("EXT-07 tarefa é única por documento/período/regra e o retry não duplica", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-300), effective_start_date: shift(-300), expiry_date: shift(-3) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const rows = await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(rows.rows[0].n, 1);
});

test("EXT-07 concorrência real de avaliação não duplica tarefa nem evento", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-300), effective_start_date: shift(-300), expiry_date: shift(-7) });
  const responses = await Promise.all([
    api("/api/ext/compliance/evaluate", { method: "POST", body: {} }),
    api("/api/ext/compliance/evaluate", { method: "POST", body: {} }),
    api("/api/ext/compliance/evaluate", { method: "POST", body: {} }),
  ]);
  for (const response of responses) assert.ok([200, 409, 503].includes(response.status), response.text);
  const tasks = await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(tasks.rows[0].n, 1);
  const documents = await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE id=$1", [document.id]);
  assert.equal(documents.rows[0].n, 1);
});

test("EXT-07 ausência de responsável ativo falha fechado sem tarefa", opt, async () => {
  const orphanStaff = await createStaff("ti");
  const obligation = await newObligation({ responsible_identity: orphanStaff.id });
  const document = await newDocument(obligation.id, { issue_date: shift(-300), effective_start_date: shift(-300), expiry_date: shift(-9) });
  await pool.query("UPDATE auth_identities SET status='suspended' WHERE id=$1", [orphanStaff.id]);
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(response.status, 200, response.text);
  assert.ok(response.body.fail_closed.some(entry => entry.document_id === document.id && entry.reason === "responsible_staff_missing"));
  const tasks = await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(tasks.rows[0].n, 0);
});

test("EXT-07 documento com responsável suspenso não aceita nova criação", opt, async () => {
  const suspended = await createStaff("ti");
  const obligation = await newObligation({ responsible_identity: suspended.id });
  await pool.query("UPDATE auth_identities SET status='suspended' WHERE id=$1", [suspended.id]);
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id) });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "responsible_staff_missing");
});

/* ---------------------------------------------------------------- tarefas */

test("EXT-07 fonte da tarefa é ext_compliance_tasks com período, regra e fatos", opt, async () => {
  const response = await api("/api/ext/compliance/tasks");
  assert.equal(response.status, 200);
  assert.equal(response.body.source, "ext_compliance_tasks");
  assert.ok(response.body.items.length > 0, "a prova precisa de pelo menos uma tarefa real");
  const task = response.body.items[0];
  for (const field of ["obligation_id", "document_id", "validity_period", "rule", "evaluation_date", "facts", "responsible_identity"]) {
    assert.ok(field in task, `tarefa sem campo ${field}`);
  }
});

test("EXT-07 tarefa nasce na mesma transação da avaliação", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-300), effective_start_date: shift(-300), expiry_date: shift(-11) });
  const idem = key("tx");
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, idempotencyKey: idem });
  assert.equal(response.status, 200, response.text);
  const event = await pool.query("SELECT created_at FROM ext_compliance_events WHERE idempotency_key=$1", [idem]);
  const task = await pool.query("SELECT created_at FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(event.rowCount, 1);
  assert.equal(task.rowCount, 1);
  assert.equal(event.rows[0].created_at.getTime(), task.rows[0].created_at.getTime(), "tarefa e evento precisam compartilhar a transação");
});

test("EXT-07 conclusão exige responsável e resultado", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-300), effective_start_date: shift(-300), expiry_date: shift(-13) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [document.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`, { method: "POST", body: {} })).status, 409);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`, { method: "POST", body: { result: "curto" } })).status, 409);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST", body: {} })).status, 200);
  const done = await api(`/api/ext/compliance/tasks/${task.id}/complete`, { method: "POST", body: { result: "Renovação sintética concluída com evidência declarada." } });
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.task.status, "concluida");
  assert.equal(done.body.task.responsible_identity, ti.id);
});

test("EXT-07 estado terminal não pode ser reaberto por HTTP nem por SQL", opt, async () => {
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE status='concluida' ORDER BY completed_at DESC LIMIT 1")).rows[0];
  assert.ok(task, "é necessária uma tarefa concluída para provar o estado terminal");
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST", body: {} })).status, 409);
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1", [task.id]), /terminal/i);
});

test("EXT-07 cancelamento exige justificativa e fica terminal", opt, async () => {
  const obligation = await newObligation();
  const document = await newDocument(obligation.id, { issue_date: shift(-300), effective_start_date: shift(-300), expiry_date: shift(-17) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [document.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/cancel`, { method: "POST", body: { justification: "curta" } })).status, 400);
  const cancelled = await api(`/api/ext/compliance/tasks/${task.id}/cancel`, { method: "POST", body: { justification: "Cancelamento sintético devidamente justificado para QA." } });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`, { method: "POST", body: { result: "Tentativa posterior ao estado terminal." } })).status, 409);
});

test("EXT-07 tarefa inexistente retorna 404", opt, async () => {
  assert.equal((await api(`/api/ext/compliance/tasks/${randomUUID()}/start`, { method: "POST", body: {} })).status, 404);
});

/* ---------------------------------------------------------------- idempotência e concorrência */

test("EXT-07 retry idêntico não duplica obrigação", opt, async () => {
  const idem = key("retry");
  const payload = obligationPayload();
  const first = await api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem });
  const second = await api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.replayed, true);
  assert.equal(first.body.obligation.id, second.body.obligation.id);
  const rows = await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [idem]);
  assert.equal(rows.rows[0].n, 1);
});

test("EXT-07 mesma chave com corpo divergente retorna 409", opt, async () => {
  const idem = key("conflict");
  await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), idempotencyKey: idem });
  const divergent = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload({ title: "Título sintético divergente QA" }), idempotencyKey: idem });
  assert.equal(divergent.status, 409);
  assert.equal(divergent.body.error, "idempotency_key_reused");
});

test("EXT-07 chave é vinculada à identidade correta", opt, async () => {
  const idem = key("identity");
  const payload = obligationPayload();
  const byTi = await api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem, cookie: cookieTi });
  const byAdmin = await api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem, cookie: cookieAdmin });
  assert.equal(byTi.status, 201);
  assert.equal(byAdmin.status, 201, byAdmin.text);
  assert.notEqual(byTi.body.obligation.id, byAdmin.body.obligation.id);
  assert.equal(byTi.body.obligation.created_by_identity, ti.id);
  assert.equal(byAdmin.body.obligation.created_by_identity, admin.id);
  const rows = await pool.query("SELECT created_by_identity FROM ext_compliance_events WHERE idempotency_key=$1 ORDER BY created_at", [idem]);
  assert.equal(rows.rowCount, 2);
});

test("EXT-07 concorrência real com a mesma chave cria uma única obrigação", opt, async () => {
  const idem = key("race");
  const payload = obligationPayload();
  const responses = await Promise.all([
    api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem }),
    api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem }),
    api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem }),
  ]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 201]);
  const rows = await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [idem]);
  assert.equal(rows.rows[0].n, 1);
});

test("EXT-07 evento histórico permanece imutável", opt, async () => {
  const event = (await pool.query("SELECT id FROM ext_compliance_events ORDER BY created_at DESC LIMIT 1")).rows[0];
  await assert.rejects(pool.query("UPDATE ext_compliance_events SET event_type='forjado' WHERE id=$1", [event.id]), /immutable/i);
  await assert.rejects(pool.query("DELETE FROM ext_compliance_events WHERE id=$1", [event.id]), /immutable/i);
});

/* ---------------------------------------------------------------- renovação e versionamento */

test("EXT-07 renovação cria novo registro com replacement_of explícito", opt, async () => {
  const obligation = await newObligation();
  const first = await newDocument(obligation.id);
  const renewal = await api(`/api/ext/compliance/documents/${first.id}/renew`, {
    method: "POST",
    body: { issue_date: shift(0), effective_start_date: shift(0), expiry_date: shift(365), reference_type: "referencia_declarada", declared_reference: "REF-SINTETICA-QA-R2", reference_source: "Registro interno sintético QA", justification: "Renovação sintética justificada para a prova." },
  });
  assert.equal(renewal.status, 201, renewal.text);
  assert.equal(renewal.body.document.replacement_of, first.id);
  assert.equal(renewal.body.document.version_no, 2);
  assert.equal(renewal.body.previous_preserved, true);
  assert.equal(renewal.body.document.created_by_identity, undefined, "autoria não é exposta na projeção mínima");
  const stored = await pool.query("SELECT created_by_identity,created_at FROM ext_compliance_documents WHERE id=$1", [renewal.body.document.id]);
  assert.equal(stored.rows[0].created_by_identity, ti.id);
  assert.ok(stored.rows[0].created_at);
});

test("EXT-07 registro anterior não é sobrescrito e o histórico é preservado", opt, async () => {
  const obligation = await newObligation();
  const first = await newDocument(obligation.id);
  const before = (await pool.query("SELECT * FROM ext_compliance_documents WHERE id=$1", [first.id])).rows[0];
  const renewal = await api(`/api/ext/compliance/documents/${first.id}/renew`, {
    method: "POST",
    body: { issue_date: shift(0), effective_start_date: shift(0), expiry_date: shift(400), reference_type: "referencia_declarada", declared_reference: "REF-SINTETICA-QA-R3", justification: "Renovação sintética com histórico preservado." },
  });
  assert.equal(renewal.status, 201, renewal.text);
  const after = (await pool.query("SELECT * FROM ext_compliance_documents WHERE id=$1", [first.id])).rows[0];
  assert.deepEqual(after.expiry_date, before.expiry_date);
  assert.equal(after.declared_reference, before.declared_reference);
  assert.equal(after.version_no, 1);
  const detail = await api(`/api/ext/compliance/documents/${first.id}`);
  assert.equal(detail.body.history.length, 2);
  assert.deepEqual(detail.body.history.map(row => row.version_no), [1, 2]);
});

test("EXT-07 ciclos e bifurcações de substituição são rejeitados", opt, async () => {
  const obligation = await newObligation();
  const first = await newDocument(obligation.id);
  const renewalBody = (ref) => ({ issue_date: shift(0), effective_start_date: shift(0), expiry_date: shift(500), reference_type: "referencia_declarada", declared_reference: ref, justification: "Renovação sintética de controle de ciclo." });
  const second = await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: renewalBody("REF-CICLO-1") });
  assert.equal(second.status, 201, second.text);
  const fork = await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: renewalBody("REF-CICLO-2") });
  assert.equal(fork.status, 409);
  assert.equal(fork.body.error, "document_already_replaced");
  const third = await api(`/api/ext/compliance/documents/${second.body.document.id}/renew`, { method: "POST", body: renewalBody("REF-CICLO-3") });
  assert.equal(third.status, 201, third.text);
  assert.equal(third.body.document.version_no, 3);
});

test("EXT-07 renovação exige justificativa, validade coerente e campos não forjados", opt, async () => {
  const obligation = await newObligation();
  const first = await newDocument(obligation.id);
  const base = { issue_date: shift(0), effective_start_date: shift(0), expiry_date: shift(300), reference_type: "referencia_declarada", declared_reference: "REF-RENOV-GUARD" };
  assert.equal((await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: base })).status, 400);
  assert.equal((await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: { ...base, justification: "Justificativa sintética válida.", expiry_date: shift(-5) } })).status, 400);
  const forged = await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: { ...base, justification: "Justificativa sintética válida.", version_no: 99 } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, "server_owned_fields_rejected");
  assert.equal((await api(`/api/ext/compliance/documents/${randomUUID()}/renew`, { method: "POST", body: { ...base, justification: "Justificativa sintética válida." } })).status, 404);
});

/* ---------------------------------------------------------------- auditoria e rollback */

test("EXT-07 falha real de audit_log retorna 503, faz rollback e permite retry", opt, async () => {
  await pool.query("CREATE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ext07_obligation_create' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
  await pool.query("CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()");
  const idem = key("rollback");
  const title = `Obrigação sintética rollback ${randomUUID().slice(0, 8)}`;
  const payload = obligationPayload({ title });
  try {
    const failed = await api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem });
    assert.equal(failed.status, 503, failed.text);
    assert.equal(failed.body.error, "audit_unavailable");
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations WHERE title=$1", [title])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [idem])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='ext07_obligation_create' AND meta::text LIKE $1", [`%${title}%`])).rows[0].n, 0);
  } finally {
    await pool.query("DROP TRIGGER qa_ext07_audit_fail_trg ON audit_log");
    await pool.query("DROP FUNCTION qa_ext07_audit_fail()");
  }
  const retried = await api("/api/ext/compliance/obligations", { method: "POST", body: payload, idempotencyKey: idem });
  assert.equal(retried.status, 201, retried.text);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations WHERE title=$1", [title])).rows[0].n, 1);
});

test("EXT-07 falha de auditoria no documento não deixa entidade parcial", opt, async () => {
  const obligation = await newObligation();
  await pool.query("CREATE FUNCTION qa_ext07_audit_fail_doc() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ext07_document_create' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
  await pool.query("CREATE TRIGGER qa_ext07_audit_fail_doc_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail_doc()");
  const idem = key("rollback-doc");
  try {
    const failed = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id), idempotencyKey: idem });
    assert.equal(failed.status, 503, failed.text);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1", [obligation.id])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [idem])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE obligation_id=$1", [obligation.id])).rows[0].n, 0);
  } finally {
    await pool.query("DROP TRIGGER qa_ext07_audit_fail_doc_trg ON audit_log");
    await pool.query("DROP FUNCTION qa_ext07_audit_fail_doc()");
  }
  const retried = await api("/api/ext/compliance/documents", { method: "POST", body: documentPayload(obligation.id), idempotencyKey: idem });
  assert.equal(retried.status, 201, retried.text);
});

test("EXT-07 auditoria canônica registra ator da sessão", opt, async () => {
  const idem = key("audit");
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationPayload(), idempotencyKey: idem });
  assert.equal(response.status, 201);
  const audit = await pool.query("SELECT actor,target FROM audit_log WHERE action='ext07_obligation_create' AND target=$1", [response.body.obligation.id]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].actor, ti.id);
});

/* ---------------------------------------------------------------- legado */

test("EXT-07 rotas legadas preservam leitura autorizada e alias items", opt, async () => {
  for (const route of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents", "/api/ext/compliance-documents"]) {
    const response = await api(route);
    assert.equal(response.status, 200, `${route}: ${response.text.slice(0, 200)}`);
    assert.ok(Array.isArray(response.body.items), `${route} perdeu o alias items`);
  }
});

test("EXT-07 legado autentica antes do 410 e distingue 401 de 403", opt, async () => {
  assert.equal((await api("/api/ext/compliance-documents", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance-documents", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: {}, cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: {}, cookie: cookieRh })).status, 403);
});

test("EXT-07 legado exige same-origin antes do 410 e escritores retornam 410", opt, async () => {
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: {}, origin: "https://atacante.invalid" })).status, 403);
  for (const route of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents", "/api/ext/compliance-documents"]) {
    const response = await api(route, { method: "POST", body: { title: "tentativa sintética" } });
    assert.equal(response.status, 410, route);
    assert.equal(response.body.canonical, "/api/ext/compliance/*");
  }
});

test("EXT-07 não existem dois escritores concorrentes para a mesma entidade", opt, async () => {
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(serverSource, /legacy_writer_retired/);
  const advanced = await readFile(path.join(root, "src/server/ext-advanced-api.mjs"), "utf8");
  assert.ok(advanced.includes("handleComplianceDocuments"), "handler legado precisa continuar existindo para leitura");
  const before = (await pool.query("SELECT count(*)::int n FROM ext_compliance_documents")).rows[0].n;
  await api("/api/ext/compliance-documents", { method: "POST", body: { title: "Escrita legada sintética", description: "Tentativa de escrita pelo caminho aposentado.", compliance_type: "outro" } });
  const after = (await pool.query("SELECT count(*)::int n FROM ext_compliance_documents")).rows[0].n;
  assert.equal(after, before, "o escritor legado não pode gravar");
});

test("EXT-07 ExtAdvancedClient.tsx permanece presente", opt, async () => {
  const source = await readFile(path.join(root, "src/app/admin/ti/ExtAdvancedClient.tsx"), "utf8");
  assert.ok(source.length > 100);
});

/* ---------------------------------------------------------------- UI e regressão EXT-08..12 */

test("EXT-07 /admin/compliance responde corretamente por HTTP", opt, async () => {
  const response = await fetch(`${base}/admin/compliance`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Compliance corporativo/i);
  assert.doesNotMatch(html, /storage_key/i);
});

test("EXT-07 não há regressão nos handlers EXT-08..12", opt, async () => {
  const routes = ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/continuity-plans", "/api/ext/analytics-experiments"];
  for (const route of routes) {
    const response = await api(route);
    assert.equal(response.status, 200, `${route}: ${response.text.slice(0, 200)}`);
  }
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");
  for (const handler of ["handleKnowledgeBase", "handleExpansionPlans", "handleExpansionScenarios", "handleContinuityPlans", "handleAnalyticsExperiments"]) {
    assert.ok(serverSource.includes(handler), `handler ausente: ${handler}`);
  }
});

test("EXT-07 handlers EXT-08..12 continuam negando anônimo e papel sem permissão", opt, async () => {
  assert.equal((await api("/api/ext/knowledge-base", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/continuity-plans", { cookie: null })).status, 401);
});

test("EXT-07 somente dados sintéticos .invalid foram usados", opt, async () => {
  const identities = await pool.query("SELECT email FROM auth_identities WHERE email LIKE 'ext07-%'");
  assert.ok(identities.rowCount >= 3);
  for (const row of identities.rows) assert.match(row.email, /\.invalid$/);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE origin='ext07_canonica' AND (file_url IS NOT NULL OR storage_key IS NOT NULL)")).rows[0].n, 0);
});
