// EXT-07: PostgreSQL real + servidor HTTP real; somente fixtures .invalid.
// Executado pelo gate scripts/qa-ext07-compliance-postgres.mjs.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
test("EXT-07 gate exige PostgreSQL real", () => { if (REQUIRE) assert.ok(RUN, "DATABASE_URL descartável ausente"); });

let server, base, pool, ti, rh, cookieTi, cookieRh, serverToday, serverLogs = "";
const idem = tag => `ext07-${tag}-${randomUUID()}`;
const marker = `qa${randomUUID().slice(0, 8)}`;

async function waitServer() {
  for (let i = 0; i < 300; i++) {
    try { const r = await fetch(`${base}/api/admin/session`); await r.text(); if ([200, 401].includes(r.status)) return; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw Error("server_did_not_start");
}
async function makeStaff(role) {
  const id = randomUUID();
  const email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query("INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')", [id, email, `QA EXT07 ${role}`]);
  await pool.query("INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)", [id, await hashPassword(password)]);
  await pool.query("INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')", [id, role]);
  return { id, email, password };
}
async function login(s) {
  const r = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: s.email, password: s.password }) });
  await r.text();
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().find(x => x.startsWith("seg_admin_session=")).split(";")[0];
}
async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw } = {}) {
  const headers = { accept: "application/json", origin, ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { "idempotency-key": key === null ? "" : key || idem("request") } : {}) };
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + url, { method, headers, body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw, signal: AbortSignal.timeout(60_000) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: r.status, body: data, text };
}
const obBody = (over = {}) => ({
  obligation_type: "licenca",
  title: `Obrigação sintética ${marker} ${randomUUID().slice(0, 6)}`,
  description: "Descrição sintética detalhada da jornada de compliance.",
  declared_source: "Fonte declarada sintética (fixture .invalid).",
  applicability_scope: "escopo sintético interno",
  applicability_justification: "Justificativa sintética de aplicabilidade declarada.",
  validity_rule: "validade anual sintética declarada",
  responsible_identity: ti.id,
  ...over,
});
const docBody = (obligationId, over = {}) => ({
  obligation_id: obligationId,
  title: "Documento sintético de compliance",
  description: "Descrição documental sintética detalhada.",
  compliance_type: "licenca",
  issue_date: "2026-01-10",
  expiry_date: "2027-01-10",
  reference_type: "referencia_declarada",
  declared_reference: "Dossiê físico 7, prateleira B (sintético)",
  reference_source: "Arquivo interno sintético",
  ...over,
});
async function createObligation(over = {}, options = {}) {
  const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obBody(over), ...options });
  assert.equal(r.status, 201, r.text);
  return r.body.obligation;
}
async function createDocument(obligationId, over = {}, options = {}) {
  const r = await api("/api/ext/compliance/documents", { method: "POST", body: docBody(obligationId, over), ...options });
  assert.equal(r.status, 201, r.text);
  return r.body.document;
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3500 + Math.floor(Math.random() * 800);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-ext07", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2), CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_LEGACY_TOKENS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = ""; server.stdout.on("data", x => { logs += x; serverLogs += x; }); server.stderr.on("data", x => { logs += x; serverLogs += x; });
  try { await waitServer(); } catch (e) { throw Error(`${e.message}\n${logs.slice(-3000)}`); }
  ti = await makeStaff("ti");
  rh = await makeStaff("rh");
  cookieTi = await login(ti);
  cookieRh = await login(rh);
  serverToday = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(r => setTimeout(r, 300)); server.kill("SIGKILL"); }
});
const opt = { skip: !RUN };

// --- Fronteira de ator e guardas HTTP básicas ---
test("EXT-07 anônimo recebe 401 com resposta (não timeout)", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance/documents", { cookie: null })).status, 401);
});
test("EXT-07 anônimo em mutação recebe 401", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", cookie: null, body: obBody() })).status, 401));
test("EXT-07 papel staff não autorizado recebe 403", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/compliance/documents", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", cookie: cookieRh, body: obBody() })).status, 403);
});
test("EXT-07 same-origin exigido apenas em mutações", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody(), origin: "https://attacker.invalid" })).status, 403));
test("EXT-07 chave de idempotência obrigatória", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody(), key: null })).status, 400));
test("EXT-07 chave curta demais recusada", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody(), key: "curta" })).status, 400));
test("EXT-07 JSON inválido é 400", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "{" })).status, 400));
test("EXT-07 JSON não-objeto é 400", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "[1,2]" })).status, 400));
test("EXT-07 corpo grande é 413", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify({ x: "x".repeat(200 * 1024) }) })).status, 413));
test("EXT-07 UUID inválido é 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody("nao-uuid") })).status, 400);
  assert.equal((await api("/api/ext/compliance/tasks/nao-uuid/complete", { method: "POST", body: { result: "Resultado sintético suficiente." } })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents/nao-uuid")).status, 400);
});

// --- Obrigações ---
test("EXT-07 obrigação exige campos estruturais", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: { title: "curto" } })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ obligation_type: "" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ applicability_justification: "x" }) })).status, 400);
});
test("EXT-07 obrigação exige responsável staff ativo e autorizado", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ responsible_identity: "nao-uuid" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ responsible_identity: randomUUID() }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ responsible_identity: rh.id }) })).status, 400);
});
test("EXT-07 obrigação deriva autoria, id, estado e timestamps do servidor", opt, async () => {
  const forgedId = randomUUID();
  const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ id: forgedId, created_by_identity: randomUUID(), status: "encerrada", created_at: "2020-01-01T00:00:00Z" }) });
  assert.equal(r.status, 201, r.text);
  const o = r.body.obligation;
  assert.notEqual(o.id, forgedId);
  assert.equal(o.created_by_identity, ti.id);
  assert.equal(o.status, "pendente");
  assert.ok(o.created_at > "2026-01-01");
});
test("EXT-07 tipos: criticality inválida recusada", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ criticality: "urgente" }) })).status, 400));

// --- Documento canônico: validade, privacidade, referência ---
test("EXT-07 documento exige obrigação existente", opt, async () => assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(randomUUID()) })).status, 404));
test("EXT-07 datas inválidas recusadas", opt, async () => {
  const o = await createObligation();
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { issue_date: "abc" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { issue_date: "2026-02-30" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { expiry_date: "2026-13-01" }) })).status, 400);
});
test("EXT-07 validade anterior à emissão/início recusada", opt, async () => {
  const o = await createObligation();
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { issue_date: "2026-06-01", expiry_date: "2026-05-01" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { issue_date: "2026-01-01", effective_start_date: "2026-03-01", expiry_date: "2026-02-01" }) })).status, 400);
});
test("EXT-07 documento exige referência declarada privada", opt, async () => {
  const o = await createObligation();
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { declared_reference: "" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { reference_type: "" }) })).status, 400);
});
test("EXT-07 documento válido nasce privado com estado temporal do servidor", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id);
  assert.equal(d.status, "vigente");
  assert.equal(d.is_private, true);
  assert.equal(d.version_no, 1);
  const pgRow = (await pool.query("SELECT is_private, file_name, file_url, storage_key, origin, created_by_identity, evaluation_date::text AS ev FROM ext_compliance_documents WHERE id=$1", [d.id])).rows[0];
  assert.equal(pgRow.is_private, true);
  assert.equal(pgRow.file_name, null);
  assert.equal(pgRow.file_url, null);
  assert.equal(pgRow.storage_key, null);
  assert.equal(pgRow.origin, "ext07_canonica");
  assert.equal(pgRow.created_by_identity, ti.id);
  assert.equal(pgRow.ev, serverToday);
});
test("EXT-07 documento ignora estado/privacidade/bytes forjados no corpo", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { status: "vencida", is_private: false, origin: "registro_legado", storage_key: "qa/forged.key", file_url: "https://attacker.invalid/f.pdf", file_name: "f.pdf", version_no: 99 });
  assert.equal(d.status, "vigente");
  const pgRow = (await pool.query("SELECT is_private, storage_key, file_url, file_name, version_no FROM ext_compliance_documents WHERE id=$1", [d.id])).rows[0];
  assert.equal(pgRow.is_private, true);
  assert.equal(pgRow.storage_key, null);
  assert.equal(pgRow.file_url, null);
  assert.equal(pgRow.file_name, null);
  assert.equal(pgRow.version_no, 1);
});
test("EXT-07 documento já vencido nasce vencida na data do servidor", opt, async () => {
  const o = await createObligation();
  const r = await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" }) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.document.status, "vencida");
});
test("EXT-07 PostgreSQL impede vigente nascida vencida", opt, async () => {
  const o = await createObligation();
  await assert.rejects(
    pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin) VALUES('COMP-EXT-20260101-QA01','Título sintético SQL','Descrição sintética SQL','licenca','vigente','QA','${ti.id}','2025-01-01','2025-06-01','regra sintética',CURRENT_DATE,'referencia_declarada','ref sintética',true,'${ti.id}','${o.id}','ext07_canonica')`),
    /vigente compliance document cannot be born expired/,
  );
});
test("EXT-07 PostgreSQL impede vencida arbitrária (sem validade no passado)", opt, async () => {
  const o = await createObligation();
  await assert.rejects(
    pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin) VALUES('COMP-EXT-20260101-QA02','Título sintético SQL','Descrição sintética SQL','licenca','vencida','QA','${ti.id}','2026-01-01','2030-06-01','regra sintética',CURRENT_DATE,'referencia_declarada','ref sintética',true,'${ti.id}','${o.id}','ext07_canonica')`),
    /vencida compliance document requires past expiry/,
  );
});
test("EXT-07 PostgreSQL impede canônico com metadados de arquivo", opt, async () => {
  const o = await createObligation();
  await assert.rejects(
    pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin,storage_key) VALUES('COMP-EXT-20260101-QA03','Título sintético SQL','Descrição sintética SQL','licenca','vigente','QA','${ti.id}','2026-01-01','2030-06-01','regra sintética',CURRENT_DATE,'referencia_declarada','ref sintética',true,'${ti.id}','${o.id}','ext07_canonica','qa/bytes.key')`),
    /declared reference, not stored bytes|reference_only/,
  );
});
test("EXT-07 listagem minimizada não expõe storage, URL, número completo ou referência", opt, async () => {
  const o = await createObligation();
  await createDocument(o.id, { document_number: "QA-123456789-SECRETO" });
  const r = await api("/api/ext/compliance/documents");
  assert.equal(r.status, 200);
  const raw = JSON.stringify(r.body.items);
  for (const forbidden of ["storage_key", "file_url", "file_name", "document_number", "declared_reference", "QA-123456789-SECRETO"]) assert.doesNotMatch(raw, new RegExp(forbidden, "i"));
  assert.equal(r.body.reference_model, "declared_reference_only");
  assert.equal(typeof r.body.denominator, "number");
});
test("EXT-07 detalhe autorizado tem allowlist e fronteira explícita", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { document_number: "QA-999-DETALHE" });
  const r = await api(`/api/ext/compliance/documents/${d.id}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.document.declared_reference, "Dossiê físico 7, prateleira B (sintético)");
  assert.equal(r.body.document.document_number, "QA-999-DETALHE");
  assert.equal(r.body.storage_model, "reference_only_no_bytes");
  assert.equal(r.body.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  assert.doesNotMatch(JSON.stringify(r.body), /storage_key|file_url/);
  assert.equal((await api(`/api/ext/compliance/documents/${randomUUID()}`)).status, 404);
});
test("EXT-07 sem rota pública: anônimo nunca recebe conteúdo documental", opt, async () => {
  for (const p of ["/api/ext/compliance/documents", "/api/ext/compliance/obligations", "/api/ext/compliance/tasks"]) {
    assert.equal((await api(p, { cookie: null })).status, 401);
  }
});

// --- Avaliação temporal e tarefas (critério de aceite) ---
test("EXT-07 relógio do cliente não move a avaliação", opt, async () => {
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2099-12-31" } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.evaluation_date, serverToday);
  assert.equal(r.body.source, "postgresql_current_date");
  assert.equal(r.body.clock, "server_only");
});
test("EXT-07 CRITÉRIO: vencimento gera tarefa e documento privado", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2026-01-01", expiry_date: serverToday });
  assert.equal(d.status, "vigente");
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.tasks_created >= 1);
  const doc = (await pool.query("SELECT status::text AS status, evaluation_date::text AS ev FROM ext_compliance_documents WHERE id=$1", [d.id])).rows[0];
  assert.equal(doc.status, "vencida");
  assert.equal(doc.ev, serverToday);
  const task = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0];
  assert.ok(task);
  assert.equal(task.obligation_id, o.id);
  assert.equal(task.responsible_identity, o.responsible_identity);
  assert.match(task.rule, /^expiry_at_or_before_evaluation_date; declared=/);
  assert.equal(task.evaluation_date instanceof Date ? task.evaluation_date.toISOString().slice(0, 10) : String(task.evaluation_date), serverToday);
  const facts = typeof task.facts === "string" ? JSON.parse(task.facts) : task.facts;
  assert.equal(facts.expiry_date, serverToday);
  assert.equal(facts.source, "postgresql_current_date");
});
test("EXT-07 avaliação repetida não duplica tarefa", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  assert.equal((await api("/api/ext/compliance/evaluate", { method: "POST", body: {} })).status, 200);
  const n1 = (await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0].n;
  const e2 = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(e2.status, 200);
  const n2 = (await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0].n;
  assert.equal(n1, 1);
  assert.equal(n2, 1);
});
test("EXT-07 avaliação falha fechado sem responsável staff ativo", opt, async () => {
  const doomed = await makeStaff("ti");
  const o = await createObligation({ responsible_identity: doomed.id });
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  await pool.query("UPDATE auth_identities SET status='disabled' WHERE id=$1", [doomed.id]);
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.blocked_without_responsible.some(x => x.document_id === d.id), JSON.stringify(r.body.blocked_without_responsible));
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0].n, 0);
  const doc = (await pool.query("SELECT status::text AS s FROM ext_compliance_documents WHERE id=$1", [d.id])).rows[0];
  assert.equal(doc.s, "vencida");
});
test("EXT-07 PostgreSQL impede duplicar tarefa por documento/período/regra", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const t = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0];
  await assert.rejects(
    pool.query("INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,responsible_identity,created_by_identity) VALUES($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7)", [o.id, d.id, t.validity_period, t.rule, t.due_date, ti.id, ti.id]),
    /duplicate key/,
  );
});
test("EXT-07 conclusão exige resultado; início só de aberta", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const t = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/complete`, { method: "POST", body: {} })).status, 400);
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/complete`, { method: "POST", body: { result: "curto" } })).status, 400);
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/start`, { method: "POST", body: {} })).status, 200);
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/start`, { method: "POST", body: {} })).status, 409);
  const done = await api(`/api/ext/compliance/tasks/${t.id}/complete`, { method: "POST", body: { result: "Renovação protocolada no dossiê sintético." } });
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.task.status, "concluida");
  assert.ok(done.body.task.completed_at);
});
test("EXT-07 terminal não reabre por API nem por banco", opt, async () => {
  const t = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE status='concluida' ORDER BY created_at DESC LIMIT 1")).rows[0];
  assert.ok(t);
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/start`, { method: "POST", body: {} })).status, 409);
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1", [t.id]), /terminal compliance task is immutable/);
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET status='em_andamento' WHERE id=$1", [t.id]), /terminal compliance task is immutable/);
});
test("EXT-07 cancelamento exige justificativa e fica terminal", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const t = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/cancel`, { method: "POST", body: {} })).status, 400);
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/cancel`, { method: "POST", body: { justification: "curto" } })).status, 400);
  const ok = await api(`/api/ext/compliance/tasks/${t.id}/cancel`, { method: "POST", body: { justification: "Cancelamento sintético devidamente justificado." } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/complete`, { method: "POST", body: { result: "Tentativa terminal sintética." } })).status, 409);
});
test("EXT-07 PostgreSQL impede conclusão sem responsável/resultado", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const t = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0];
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET status='concluida', completion_result=NULL WHERE id=$1", [t.id]), /task completion requires responsible and result/);
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET status='concluida', completion_result='curto' WHERE id=$1", [t.id]), /task completion requires responsible and result/);
});
test("EXT-07 listagem de tarefas declara fonte, denominador e ausência", opt, async () => {
  const r = await api("/api/ext/compliance/tasks");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "ext_compliance_tasks");
  assert.equal(typeof r.body.denominator, "number");
  assert.ok("absence_is_not_zero" in r.body);
  assert.ok(r.body.items.every(x => x.rule && x.evaluation_date && x.due_date));
});

// --- Renovação e versionamento ---
test("EXT-07 renovação cria nova versão vinculada e supera a anterior", opt, async () => {
  const o = await createObligation();
  const old = await createDocument(o.id, { issue_date: "2026-01-01", expiry_date: serverToday });
  const r = await api(`/api/ext/compliance/documents/${old.id}/renew`, { method: "POST", body: { issue_date: serverToday, expiry_date: "2027-12-31", declared_reference: "Dossiê físico 8, prateleira C (sintético)", reference_type: "referencia_declarada", renewal_justification: "Renovação anual sintética protocolada." } });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.document.version_no, 2);
  assert.equal(r.body.document.status, "vigente");
  const rows = (await pool.query("SELECT id,status::text AS status,superseded_by,replacement_of,version_no,renewal_justification FROM ext_compliance_documents WHERE obligation_id=$1 ORDER BY version_no", [o.id])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].superseded_by, r.body.document.id);
  assert.equal(rows[0].status, "em_renovacao");
  assert.equal(rows[1].replacement_of, old.id);
  assert.equal(rows[1].renewal_justification, "Renovação anual sintética protocolada.");
});
test("EXT-07 renovação exige justificativa", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id);
  assert.equal((await api(`/api/ext/compliance/documents/${d.id}/renew`, { method: "POST", body: { issue_date: serverToday, expiry_date: "2027-12-31", declared_reference: "Ref sintética suficiente" } })).status, 400);
});
test("EXT-07 renovação exige validade futura", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id);
  assert.equal((await api(`/api/ext/compliance/documents/${d.id}/renew`, { method: "POST", body: { issue_date: "2025-01-01", expiry_date: "2025-06-01", declared_reference: "Ref sintética suficiente", renewal_justification: "Justificativa sintética válida." } })).status, 400);
});
test("EXT-07 novo documento não pode apontar para obrigação alheia nem já superado", opt, async () => {
  const o1 = await createObligation();
  const o2 = await createObligation();
  const d2 = await createDocument(o2.id);
  await assert.rejects(
    pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin,replacement_of) VALUES('COMP-EXT-20260101-QA04','Título sintético SQL','Descrição sintética SQL','licenca','vigente','QA','${ti.id}','${serverToday}','2030-06-01','regra sintética',CURRENT_DATE,'referencia_declarada','ref sintética',true,'${ti.id}','${o1.id}','ext07_canonica','${d2.id}')`),
    /renewal must reference a canonical document of the same obligation|paired/,
  );
});
test("EXT-07 documento superado é histórico imutável e não re-renova", opt, async () => {
  const o = await createObligation();
  const old = await createDocument(o.id);
  const r = await api(`/api/ext/compliance/documents/${old.id}/renew`, { method: "POST", body: { issue_date: serverToday, expiry_date: "2027-12-31", declared_reference: "Ref sintética suficiente", renewal_justification: "Renovação sintética válida número um." } });
  assert.equal(r.status, 201, r.text);
  const again = await api(`/api/ext/compliance/documents/${old.id}/renew`, { method: "POST", body: { issue_date: serverToday, expiry_date: "2028-12-31", declared_reference: "Ref sintética suficiente", renewal_justification: "Tentativa duplicada sintética." } });
  assert.equal(again.status, 409);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET title='Sobrescrita destrutiva' WHERE id=$1", [old.id]), /immutable history/);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET expiry_date='2031-01-01' WHERE id=$1", [old.id]), /immutable history/);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET superseded_by=NULL WHERE id=$1", [old.id]), /immutable history/);
});
test("EXT-07 no máximo uma versão atual por obrigação (API e PostgreSQL)", opt, async () => {
  const o = await createObligation();
  const d1 = await createDocument(o.id);
  await assert.rejects(
    pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin) VALUES('COMP-EXT-20260101-QA05','Título sintético SQL','Descrição sintética SQL','licenca','vigente','QA','${ti.id}','${serverToday}','2030-06-01','regra sintética',CURRENT_DATE,'referencia_declarada','ref sintética',true,'${ti.id}','${o.id}','ext07_canonica')`),
    /duplicate key/,
  );
  assert.ok(d1);
});
test("EXT-07 vínculo replacement_of não aceita ciclo nem adulteração", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET replacement_of=id WHERE id=$1", [d.id]), /immutable; create a renewal/);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET created_by_identity=$2 WHERE id=$1", [d.id, rh.id]), /immutable; create a renewal/);
});

// --- Cancelamento de documento e terminal ---
test("EXT-07 cancelamento de documento exige justificativa e vira terminal", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id);
  assert.equal((await api(`/api/ext/compliance/documents/${d.id}/cancel`, { method: "POST", body: {} })).status, 400);
  const ok = await api(`/api/ext/compliance/documents/${d.id}/cancel`, { method: "POST", body: { cancellation_justification: "Cancelamento sintético com justificativa formal." } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.document.status, "cancelada");
  assert.equal((await api(`/api/ext/compliance/documents/${d.id}/cancel`, { method: "POST", body: { cancellation_justification: "Segunda tentativa sintética." } })).status, 409);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET status='vigente' WHERE id=$1", [d.id]), /terminal compliance document cannot reopen/);
});
test("EXT-07 PostgreSQL impede transição de estado arbitrária", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: serverToday, expiry_date: "2030-01-01" });
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET status='vencida' WHERE id=$1", [d.id]), /invalid canonical compliance document transition/);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET status='em_renovacao' WHERE id=$1", [d.id]), /invalid canonical compliance document transition|paired|superseded_by/);
});
test("EXT-07 eventos históricos são imutáveis", opt, async () => {
  const e = (await pool.query("SELECT id FROM ext_compliance_events LIMIT 1")).rows[0];
  assert.ok(e);
  await assert.rejects(pool.query("DELETE FROM ext_compliance_events WHERE id=$1", [e.id]), /compliance historical record is immutable/);
  await assert.rejects(pool.query("UPDATE ext_compliance_events SET event_type='forged' WHERE id=$1", [e.id]), /compliance historical record is immutable/);
});

// --- Idempotência, retry, concorrência, auditoria ---
test("EXT-07 retry idêntico não duplica obrigação", opt, async () => {
  const key = idem("retry");
  const body = obBody();
  const a = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  const b = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(a.body.obligation.id, b.body.obligation.id);
  assert.equal(b.body.replayed, true);
});
test("EXT-07 mesma chave com corpo divergente é 409", opt, async () => {
  const key = idem("divergent");
  await api("/api/ext/compliance/obligations", { method: "POST", body: obBody(), key });
  const div = await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ description: "Descrição divergente sintética." }), key });
  assert.equal(div.status, 409);
});
test("EXT-07 fingerprint considera chaves aninhadas", opt, async () => {
  const key = idem("nested");
  const o = await createObligation();
  await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { document_number: "A-1" }), key });
  const div = await api("/api/ext/compliance/documents", { method: "POST", body: docBody(o.id, { document_number: "B-2" }), key });
  assert.equal(div.status, 409);
});
test("EXT-07 concorrência real com mesma chave cria um único recurso", opt, async () => {
  const key = idem("race");
  const body = obBody();
  const [a, b] = await Promise.all([
    api("/api/ext/compliance/obligations", { method: "POST", body, key }),
    api("/api/ext/compliance/obligations", { method: "POST", body, key }),
  ]);
  assert.ok([200, 201].includes(a.status) && [200, 201].includes(b.status));
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [key])).rows[0].n, 1);
});
test("EXT-07 concorrência de avaliação não duplica tarefas", opt, async () => {
  const o = await createObligation();
  const d = await createDocument(o.id, { issue_date: "2025-01-01", expiry_date: "2025-06-01" });
  const [a, b] = await Promise.all([
    api("/api/ext/compliance/evaluate", { method: "POST", body: {} }),
    api("/api/ext/compliance/evaluate", { method: "POST", body: {} }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [d.id])).rows[0].n, 1);
});
test("EXT-07 falha de audit_log retorna 503 e faz rollback completo", opt, async () => {
  await pool.query(`CREATE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext07_obligation_create' THEN RAISE EXCEPTION 'audit fail'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()`);
  const key = idem("rollback");
  try {
    const before = (await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations")).rows[0].n;
    const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obBody({ title: `Rollback audit ${marker}` }), key });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "audit_unavailable");
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations")).rows[0].n, before);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [key])).rows[0].n, 0);
  } finally {
    await pool.query("DROP TRIGGER IF EXISTS qa_ext07_audit_fail_trg ON audit_log");
    await pool.query("DROP FUNCTION IF EXISTS qa_ext07_audit_fail()");
  }
});

// --- Legado ---
test("EXT-07 legado: items, 401, 403, same-origin, 410", opt, async () => {
  const g = await api("/api/ext/compliance-documents");
  assert.equal(g.status, 200);
  assert.ok(Array.isArray(g.body.items));
  assert.equal(g.body.projection, "minimized_no_storage_no_document_number");
  assert.equal((await api("/api/ext/compliance-documents", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance-documents", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: { title: "x" }, origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: { title: "x" } })).status, 410);
  assert.equal((await api("/api/ext/compliance-documents", { method: "PATCH", body: { id: randomUUID(), status: "cancelada" } })).status, 410);
});
test("EXT-07 legado minimizado não vaza storage/número/referência", opt, async () => {
  const o = await createObligation();
  await createDocument(o.id, { document_number: "LEGADO-SECRETO-QA" });
  const g = await api("/api/ext/compliance-documents");
  const raw = JSON.stringify(g.body.items);
  for (const forbidden of ["storage_key", "file_url", "file_name", "document_number", "declared_reference", "LEGADO-SECRETO-QA"]) assert.doesNotMatch(raw, new RegExp(forbidden, "i"));
});
test("EXT-07 alias admin/hr legado fica atrás da autorização da borda", opt, async () => {
  const denied = await api("/api/admin/hr/ext-compliance-documents");
  assert.equal(denied.status, 403);
  await pool.query(
    "INSERT INTO auth_permissions(id,identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason) VALUES($1,$2,'employees.read','global',NULL,$2,'admin','QA EXT07 alias probe')",
    [randomUUID(), ti.id],
  );
  const allowed = await api("/api/admin/hr/ext-compliance-documents");
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray(allowed.body.items));
  assert.equal((await api("/api/admin/hr/ext-compliance-documents", { cookie: null })).status, 401);
});

// --- UI, rota pública e não regressão ---
test("EXT-07 tela /admin/compliance responde 200 com marca própria", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`);
  const t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /[Cc]ompliance/);
});
test("EXT-07 não regressão EXT-08..12: handlers preservados", opt, async () => {
  for (const p of ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/continuity-plans", "/api/ext/analytics-experiments", "/api/ext/visual-tokens", "/api/ext/visual-layouts"]) {
    let r;
    try {
      r = await api(p);
    } catch (e) {
      const act = await pool.query("SELECT pid, state, wait_event_type, wait_event, now()-xact_start AS xact_age, left(query,140) AS q FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY pid");
      let tcpProbe = "n/a", procState = "n/a";
      try {
        const { execSync } = await import("node:child_process");
        procState = execSync(`ps -o pid,stat,%cpu,etime,rss -p ${server.pid}`, { encoding: "utf8" }).replace(/\n/g, "|");
      } catch (err) { procState = "ps_error:" + err.message; }
      try {
        const net = await import("node:net");
        tcpProbe = await new Promise((resolve) => {
          const s = net.connect(base.split(":").pop(), "127.0.0.1");
          s.setTimeout(8000, () => { s.destroy(); resolve("tcp_timeout_no_response"); });
          s.on("connect", () => s.write("GET /api/ext/continuity-plans HTTP/1.0\r\nHost: probe\r\nCookie: " + cookieTi + "\r\n\r\n"));
          let d = ""; s.on("data", c => { d += c; if (d.length > 512) s.destroy(); });
          s.on("close", () => resolve(d.slice(0, 256) || "tcp_closed_without_data"));
          s.on("error", err => resolve("tcp_error:" + err.code));
        });
      } catch (err) { tcpProbe = "probe_error:" + err.message; }
      throw Error(`stalled_request:${p}\npg_activity=${JSON.stringify(act.rows)}\nproc=${procState}\ntcp_probe=${JSON.stringify(tcpProbe)}\nserver_log_tail=${serverLogs.slice(-2500)}`, { cause: e });
    }
    assert.equal(r.status, 200, p);
  }
  assert.equal((await api("/api/ext/knowledge-base", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/visual-tokens", { cookie: cookieRh })).status, 401);
});
test("EXT-07 cluster limpo não recebeu seed retroativo", opt, async () => {
  const seed = await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE created_by_identity IS NULL AND origin='ext07_canonica'");
  assert.equal(seed.rows[0].n, 0);
  const legacy = await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE origin='registro_legado'");
  assert.equal(legacy.rows[0].n, 0);
});
test("EXT-07 agregados de obrigações declaram fonte e distinguem ausência", opt, async () => {
  const r = await api("/api/ext/compliance/obligations");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "ext_compliance_obligations");
  assert.equal(typeof r.body.denominator, "number");
  assert.ok("absence_is_not_zero" in r.body);
  assert.ok(r.body.denominator >= 1);
});
