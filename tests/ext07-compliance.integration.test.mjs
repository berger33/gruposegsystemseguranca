// EXT-07 — PostgreSQL 17 real + servidor HTTP real + sessão staff real.
// Somente fixtures sintéticas em .invalid; nenhuma integração externa.
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
test("EXT-07 gate exige PostgreSQL real", () => { assert.ok(REQUIRE); assert.ok(RUN); });

let server, pool, base, ti, rh, responsible, inactive, cookieTi, cookieRh, today;
let primaryObligation, primaryDocument, renewedDocument, expiredDocument, completedTask, cancelledTask;
const idem = label => `ext07-${label}-${randomUUID()}`;
const iso = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const offset = (date, days) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);

async function waitForServer() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try { if ([200, 401].includes((await fetch(`${base}/api/admin/session`)).status)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error("server_did_not_start");
}
async function makeStaff(role, status = "active") {
  const id = randomUUID(), email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`, password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,$4)`, [id, email, `QA EXT07 ${role} ${id.slice(0, 4)}`, status]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}
async function login(staff) {
  const response = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: staff.email, password: staff.password }) });
  assert.equal(response.status, 200, await response.text());
  return response.headers.getSetCookie().find(value => value.startsWith("seg_admin_session=")).split(";")[0];
}
async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw } = {}) {
  const headers = { accept: "application/json", origin, ...(cookie ? { cookie } : {}) };
  if (method !== "GET" && key !== null) headers["idempotency-key"] = key || idem("request");
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + url, { method, headers, signal: AbortSignal.timeout(20000), body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw });
  const text = await response.text(); let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: response.status, body: data, text, headers: response.headers };
}
const obligationBody = (overrides = {}) => ({
  obligation_type: "licenca", title: `Obrigação sintética ${randomUUID().slice(0, 8)}`,
  description: "Descrição sintética de aplicabilidade interna, sem valor jurídico.",
  declared_source: "Fonte interna sintética em https://fonte.example.invalid/politica",
  applicability_scope: "Escopo corporativo sintético",
  applicability_justification: "Aplicabilidade declarada para exercitar a jornada sintética.",
  validity_rule: "Validade até a data declarada na referência documental.",
  renewal_lead_days: 30, criticality: "alta", responsible_identity: ti.id, ...overrides,
});
const documentBody = (obligationId, overrides = {}) => ({
  obligation_id: obligationId, title: `Referência sintética ${randomUUID().slice(0, 8)}`,
  description: "Referência documental privada sintética, sem arquivo ou bytes.",
  compliance_type: "licenca", document_number: "DOC-SINTETICO-0001", issuer: "Emissor sintético .invalid",
  issue_date: offset(today, -2), effective_start_date: offset(today, -1), expiry_date: offset(today, 365),
  reference_type: "referencia_declarada", declared_reference: "REF-SINTETICA-PRIVADA-0001",
  reference_source: "https://documento.example.invalid/referencia", ...overrides,
});
async function createObligation(overrides = {}, options = {}) {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationBody(overrides), ...options });
  assert.equal(response.status, 201, response.text); return response.body.obligation;
}
async function createDocument(obligationId, overrides = {}, options = {}) {
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(obligationId, overrides), ...options });
  assert.equal(response.status, 201, response.text); return response.body.document;
}

before(async () => {
  if (!RUN) throw new Error("EXT07_DATABASE_REQUIRED");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  today = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
  const port = 3600 + Math.floor(Math.random() * 700); base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-ext07", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2), SITE_ADMIN_LEGACY_TOKENS: "", ADMIN_LOGIN_MAX_ATTEMPTS: "50", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = ""; server.stdout.on("data", chunk => { logs += chunk; if (/EXT-07|routeApi error/i.test(String(chunk))) process.stderr.write(chunk); }); server.stderr.on("data", chunk => { logs += chunk; process.stderr.write(chunk); });
  server.on("exit", (code, signal) => { process.stderr.write(`EXT07_TEST_SERVER_EXIT code=${code} signal=${signal}\n`); });
  try { await waitForServer(); } catch (error) { throw new Error(`${error.message}\n${logs.slice(-4000)}`); }
  ti = await makeStaff("ti"); rh = await makeStaff("rh"); responsible = await makeStaff("ti"); inactive = await makeStaff("ti", "suspended");
  cookieTi = await login(ti); cookieRh = await login(rh);
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(resolve => setTimeout(resolve, 400)); server.kill("SIGKILL"); }
});

test("EXT-07 cluster limpo não recebe seed", async () => {
  const result = await pool.query(`SELECT (SELECT count(*)::int FROM ext_compliance_obligations) obligations,(SELECT count(*)::int FROM ext_compliance_documents WHERE origin='ext07_canonica') documents,(SELECT count(*)::int FROM ext_compliance_tasks) tasks`);
  assert.deepEqual(result.rows[0], { obligations: 0, documents: 0, tasks: 0 });
});
test("EXT-07 rota canônica anônima devolve 401", async () => assert.equal((await api("/api/ext/compliance/obligations", { cookie: null })).status, 401));
test("EXT-07 papel staff não autorizado devolve 403", async () => assert.equal((await api("/api/ext/compliance/obligations", { cookie: cookieRh })).status, 403));
test("EXT-07 mutação exige same-origin", async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationBody(), origin: "https://attacker.invalid" })).status, 403));
test("EXT-07 mutação exige Idempotency-Key", async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationBody(), key: null })).status, 400));
test("EXT-07 JSON inválido devolve 400", async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "{" })).status, 400));
test("EXT-07 corpo grande devolve 413", async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify({ value: "x".repeat(40000) }) })).status, 413));
test("EXT-07 responsável com UUID inválido é recusado", async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationBody({ responsible_identity: "bad" }) })).status, 400));
test("EXT-07 responsável inativo é recusado", async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationBody({ responsible_identity: inactive.id }) })).status, 400));
test("EXT-07 obrigação preserva fonte, escopo, regra, criticidade e aplicabilidade", async () => {
  primaryObligation = await createObligation({ title: "Obrigação principal sintética" });
  assert.equal(primaryObligation.declared_source.includes(".invalid"), true); assert.equal(primaryObligation.applicability_scope, "Escopo corporativo sintético");
  assert.equal(primaryObligation.validity_rule, "Validade até a data declarada na referência documental."); assert.equal(primaryObligation.criticality, "alta"); assert.equal(primaryObligation.status, "pendente");
});
test("EXT-07 autoria, ID, estado e timestamps forjados são ignorados", async () => {
  const forged = randomUUID(), row = await createObligation({ id: forged, created_by_identity: forged, status: "encerrada", created_at: "2000-01-01", updated_at: "2000-01-01" });
  assert.notEqual(row.id, forged); assert.equal(row.created_by_identity, ti.id); assert.equal(row.status, "pendente"); assert.notEqual(iso(row.created_at), "2000-01-01");
});
test("EXT-07 retry idêntico de obrigação não duplica", async () => {
  const key = idem("obligation-retry"), body = obligationBody({ title: "Obrigação retry sintética" });
  const first = await api("/api/ext/compliance/obligations", { method: "POST", body, key }), second = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  assert.equal(first.status, 201); assert.equal(second.status, 200); assert.equal(first.body.obligation.id, second.body.obligation.id); assert.equal(second.body.replayed, true);
});
test("EXT-07 mesma chave com corpo divergente devolve 409", async () => {
  const key = idem("obligation-divergent"), first = obligationBody({ title: "Obrigação chave A sintética" });
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: first, key })).status, 201);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: { ...first, title: "Obrigação chave B sintética" }, key })).status, 409);
});
test("EXT-07 concorrência real com a mesma chave cria um pai", async () => {
  const key = idem("obligation-race"), title = `Obrigação corrida ${randomUUID().slice(0, 8)}`, body = obligationBody({ title });
  const results = await Promise.all([api("/api/ext/compliance/obligations", { method: "POST", body, key }), api("/api/ext/compliance/obligations", { method: "POST", body, key })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]); assert.equal(results[0].body.obligation.id, results[1].body.obligation.id);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title=$1`, [title])).rows[0].n, 1);
});
test("EXT-07 documento com obrigação UUID inválida é 400", async () => assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody("bad") })).status, 400));
test("EXT-07 documento sem obrigação existente é 404", async () => assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(randomUUID()) })).status, 404));
test("EXT-07 tipo documental arbitrário é recusado em pai novo", async () => {
  const parent = await createObligation(); assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(parent.id, { compliance_type: "arbitrario" }) })).status, 400);
});
test("EXT-07 data civil inválida é recusada em pai novo", async () => {
  const parent = await createObligation(); assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(parent.id, { issue_date: "2026-02-31" }) })).status, 400);
});
test("EXT-07 vencimento anterior à emissão é recusado em pai novo", async () => {
  const parent = await createObligation(); assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(parent.id, { issue_date: offset(today, 2), effective_start_date: offset(today, 2), expiry_date: offset(today, 1) }) })).status, 400);
});
test("EXT-07 vencimento anterior ao início é recusado em pai novo", async () => {
  const parent = await createObligation(); assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(parent.id, { issue_date: offset(today, -2), effective_start_date: offset(today, 2), expiry_date: offset(today, 1) }) })).status, 400);
});
test("EXT-07 documento deriva estado, validade, autor e privacidade", async () => {
  primaryDocument = await createDocument(primaryObligation.id, { title: "Documento principal sintético", id: randomUUID(), status: "vencida", created_by_identity: responsible.id, validity_rule: "forjada", is_private: false, file_url: "https://arquivo.example.invalid/private", storage_key: "forged/key" });
  assert.equal(primaryDocument.status, "vigente"); assert.equal(primaryDocument.created_by_identity, ti.id); assert.equal(primaryDocument.is_private, true); assert.equal(primaryDocument.version_no, 1); assert.equal(primaryDocument.is_current, true);
  const stored = (await pool.query(`SELECT validity_rule,file_name,file_url,storage_key,is_private,created_by_identity FROM ext_compliance_documents WHERE id=$1`, [primaryDocument.id])).rows[0];
  assert.equal(stored.validity_rule, primaryObligation.validity_rule); assert.equal(stored.file_name, null); assert.equal(stored.file_url, null); assert.equal(stored.storage_key, null); assert.equal(stored.is_private, true); assert.equal(stored.created_by_identity, ti.id);
});
test("EXT-07 documento já vencido recebe estado derivado, não arbitrário", async () => {
  const parent = await createObligation(); expiredDocument = await createDocument(parent.id, { title: "Documento vencido sintético", issue_date: offset(today, -60), effective_start_date: offset(today, -59), expiry_date: offset(today, -1), status: "vigente" });
  assert.equal(expiredDocument.status, "vencida"); assert.equal(iso(expiredDocument.expiry_date), offset(today, -1));
});
test("EXT-07 validade sem regra declarada é impedida pelo PostgreSQL", async () => {
  await assert.rejects(pool.query(`UPDATE ext_compliance_obligations SET validity_rule='' WHERE id=$1`, [primaryObligation.id]), /immutable|check constraint/);
});
test("EXT-07 listagem é minimizada", async () => {
  const response = await api("/api/ext/compliance/documents"), raw = JSON.stringify(response.body.items);
  assert.equal(response.status, 200); for (const field of ["storage_key", "file_url", "document_number", "declared_reference", "reference_source"]) assert.doesNotMatch(raw, new RegExp(field, "i"));
});
test("EXT-07 detalhe autorizado usa allowlist e diferencia referência de arquivo", async () => {
  const response = await api(`/api/ext/compliance/documents/${primaryDocument.id}`), raw = JSON.stringify(response.body);
  assert.equal(response.status, 200); assert.equal(response.body.document.declared_reference, "REF-SINTETICA-PRIVADA-0001"); assert.equal(response.body.file_boundary.bytes, false);
  for (const field of ["storage_key", "file_url", "file_name"]) assert.doesNotMatch(raw, new RegExp(`"${field}"`, "i"));
});
test("EXT-07 detalhe com UUID inválido é 400", async () => assert.equal((await api("/api/ext/compliance/documents/not-a-uuid")).status, 400));
test("EXT-07 não possui rota pública documental", async () => assert.equal((await api("/api/public/ext/compliance/documents", { cookie: null })).status, 404));
test("EXT-07 segundo registro inicial exige renovação", async () => assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: documentBody(primaryObligation.id) })).status, 409));
test("EXT-07 PATCH destrutivo não é aceito", async () => assert.equal((await api(`/api/ext/compliance/documents/${primaryDocument.id}`, { method: "PATCH", body: { expiry_date: offset(today, 500) } })).status, 405));
test("EXT-07 renovação exige UUID e justificativa", async () => {
  assert.equal((await api("/api/ext/compliance/documents/bad/renew", { method: "POST", body: documentBody(null) })).status, 400);
  assert.equal((await api(`/api/ext/compliance/documents/${primaryDocument.id}/renew`, { method: "POST", body: { ...documentBody(null), justification: "curta" } })).status, 400);
});
test("EXT-07 renovação cria nova linha e substitui formalmente a anterior", async () => {
  const key = idem("renew"), body = { ...documentBody(null, { title: "Documento renovado sintético", issue_date: offset(today, 1), effective_start_date: offset(today, 1), expiry_date: offset(today, 500), declared_reference: "REF-RENOVADA-PRIVADA-0002" }), justification: "Renovação sintética por novo período de validade declarado." };
  const response = await api(`/api/ext/compliance/documents/${primaryDocument.id}/renew`, { method: "POST", body, key });
  assert.equal(response.status, 201, response.text); renewedDocument = response.body.document;
  assert.equal(renewedDocument.version_no, 2); assert.equal(renewedDocument.replacement_of, primaryDocument.id); assert.equal(renewedDocument.renewed_by_identity, ti.id); assert.equal(renewedDocument.is_current, true);
  const previous = (await pool.query(`SELECT status::text,is_current,superseded_by,expiry_date FROM ext_compliance_documents WHERE id=$1`, [primaryDocument.id])).rows[0];
  assert.deepEqual({ status: previous.status, current: previous.is_current, successor: previous.superseded_by }, { status: "substituida", current: false, successor: renewedDocument.id }); assert.equal(iso(previous.expiry_date), offset(today, 365));
});
test("EXT-07 retry da renovação não cria terceira versão", async () => {
  const parent = await createObligation(), original = await createDocument(parent.id), key = idem("renew-retry"), body = { ...documentBody(null, { title: "Renovação retry sintética", issue_date: offset(today, 1), effective_start_date: offset(today, 1), expiry_date: offset(today, 400) }), justification: "Justificativa sintética suficiente para retry idêntico." };
  const first = await api(`/api/ext/compliance/documents/${original.id}/renew`, { method: "POST", body, key }), second = await api(`/api/ext/compliance/documents/${original.id}/renew`, { method: "POST", body, key });
  assert.equal(first.status, 201); assert.equal(second.status, 200); assert.equal(first.body.document.id, second.body.document.id); assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1`, [parent.id])).rows[0].n, 2);
});
test("EXT-07 no máximo uma versão atual por obrigação", async () => {
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1 AND is_current IS TRUE`, [primaryObligation.id])).rows[0].n, 1);
  await assert.rejects(pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,version_no,is_current) VALUES($1,'Outra versão atual','Referência sintética concorrente.','licenca','vigente','QA TI',$2,$3,$3,$4,$5,'referencia_declarada','REF-CONCORRENTE','https://corrente.example.invalid',true,$2,$6,'ext07_canonica',1,true)`, [`COMP-EXT-${today.replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`, ti.id, offset(today, 1), offset(today, 400), "Validade sintética", primaryObligation.id]), /unique|ext_compliance_current_version_unique/);
});
test("EXT-07 banco impede sobrescrita destrutiva, descanonização e ciclo", async () => {
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET expiry_date=$2 WHERE id=$1`, [renewedDocument.id, offset(today, 800)]), /immutable|renewal/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET replacement_of=id WHERE id=$1`, [renewedDocument.id]), /immutable|cycle|renewal/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET is_private=false WHERE id=$1`, [renewedDocument.id]), /private|immutable|check constraint/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET origin='registro_legado' WHERE id=$1`, [renewedDocument.id]), /origin|immutable/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET protocol=$2 WHERE id=$1`, [renewedDocument.id, `COMP-EXT-${today.replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`]), /immutable|renewal/);
});
test("EXT-07 avaliação recusa relógio do cliente", async () => assert.equal((await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2000-01-01" } })).status, 400));
test("EXT-07 avaliação por HTTP cria tarefa na mesma transação", async () => {
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("evaluate") });
  assert.equal(response.status, 200, response.text); assert.equal(response.body.source, "ext_compliance_documents"); assert.equal(response.body.date_base, today); assert.equal(response.body.rule, "expiry_at_or_before_server_date"); assert.equal(typeof response.body.denominator, "number"); assert.equal(response.body.absence, null); assert.ok(response.body.tasks_created >= 1);
  completedTask = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE document_id=$1`, [expiredDocument.id])).rows[0]; assert.ok(completedTask); assert.equal(iso(completedTask.evaluation_date), today); assert.equal(completedTask.facts.source, "ext_compliance_documents"); assert.equal(completedTask.facts.date_base, today);
});
test("EXT-07 avaliação repetida não duplica tarefa", async () => {
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("evaluate-again") }); assert.equal(response.status, 200); assert.equal(response.body.tasks_created, 0);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [expiredDocument.id])).rows[0].n, 1);
});
test("EXT-07 concorrência real de avaliação mantém uma tarefa por documento/período/regra", async () => {
  const parent = await createObligation(), document = await createDocument(parent.id, { issue_date: offset(today, -10), effective_start_date: offset(today, -9), expiry_date: offset(today, -1) });
  const responses = await Promise.all([
    api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("evaluate-race-a") }),
    api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("evaluate-race-b") }),
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [document.id])).rows[0].n, 1);
});
test("EXT-07 listagem de tarefas declara fonte, regra, fatos e data-base", async () => {
  const response = await api("/api/ext/compliance/tasks"), task = response.body.items.find(item => item.id === completedTask.id); assert.equal(response.status, 200); assert.equal(response.body.source, "ext_compliance_tasks"); assert.equal(task.rule, "expiry_at_or_before_server_date"); assert.equal(task.facts.date_base, today);
});
test("EXT-07 tarefa aberta não conclui sem iniciar", async () => assert.equal((await api(`/api/ext/compliance/tasks/${completedTask.id}/complete`, { method: "POST", body: { result: "Resultado sintético suficiente." } })).status, 409));
test("EXT-07 tarefa inicia com autoria e timestamp do servidor", async () => {
  const response = await api(`/api/ext/compliance/tasks/${completedTask.id}/start`, { method: "POST", body: {} }); assert.equal(response.status, 200); assert.equal(response.body.task.status, "em_andamento"); assert.equal(response.body.task.started_by_identity, ti.id); assert.ok(response.body.task.started_at);
});
test("EXT-07 conclusão exige resultado", async () => assert.equal((await api(`/api/ext/compliance/tasks/${completedTask.id}/complete`, { method: "POST", body: {} })).status, 400));
test("EXT-07 conclusão registra responsável, resultado e terminal", async () => {
  const response = await api(`/api/ext/compliance/tasks/${completedTask.id}/complete`, { method: "POST", body: { result: "Resultado sintético da regularização concluída." } }); assert.equal(response.status, 200); assert.equal(response.body.task.status, "concluida"); assert.equal(response.body.task.completed_by_identity, ti.id); assert.equal(response.body.task.responsible_identity, completedTask.responsible_identity);
  assert.equal((await api(`/api/ext/compliance/tasks/${completedTask.id}/start`, { method: "POST", body: {} })).status, 409);
});
test("EXT-07 cancelamento exige justificativa e preserva terminal", async () => {
  const parent = await createObligation(), document = await createDocument(parent.id, { issue_date: offset(today, -20), effective_start_date: offset(today, -19), expiry_date: offset(today, -1) }); await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("evaluate-cancel") });
  cancelledTask = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE document_id=$1`, [document.id])).rows[0]; assert.equal((await api(`/api/ext/compliance/tasks/${cancelledTask.id}/cancel`, { method: "POST", body: { justification: "curta" } })).status, 400);
  const response = await api(`/api/ext/compliance/tasks/${cancelledTask.id}/cancel`, { method: "POST", body: { justification: "Cancelamento sintético devidamente justificado." } }); assert.equal(response.status, 200); assert.equal(response.body.task.status, "cancelada"); assert.equal(response.body.task.cancelled_by_identity, ti.id); assert.equal((await api(`/api/ext/compliance/tasks/${cancelledTask.id}/start`, { method: "POST", body: {} })).status, 409);
});
test("EXT-07 PostgreSQL impede reabertura, fatos e campos de etapa forjados", async () => {
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1`, [completedTask.id]), /terminal/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET facts='{}' WHERE id=$1`, [cancelledTask.id]), /immutable|terminal/);
  const open = (await pool.query(`SELECT id FROM ext_compliance_tasks WHERE status='aberta' ORDER BY created_at LIMIT 1`)).rows[0]; assert.ok(open);
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status='em_andamento',started_at=NOW(),started_by_identity=$2,completion_result='Resultado forjado antes da conclusão.' WHERE id=$1`, [open.id, ti.id]), /invalid compliance task transition/);
});
test("EXT-07 falha fechado quando responsável deixa de estar ativo", async () => {
  const parent = await createObligation({ responsible_identity: responsible.id }), document = await createDocument(parent.id, { issue_date: offset(today, -30), effective_start_date: offset(today, -29), expiry_date: offset(today, -1) }); await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`, [responsible.id]);
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("fail-closed") }); assert.equal(response.status, 409); assert.equal(response.body.error, "responsible_staff_missing"); assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [document.id])).rows[0].n, 0);
  await pool.query(`UPDATE auth_identities SET status='active' WHERE id=$1`, [responsible.id]);
});
test("EXT-07 eventos históricos são imutáveis", async () => {
  const event = (await pool.query(`SELECT id FROM ext_compliance_events ORDER BY created_at LIMIT 1`)).rows[0]; await assert.rejects(pool.query(`DELETE FROM ext_compliance_events WHERE id=$1`, [event.id]), /immutable/);
});
test("EXT-07 legado exato preserva items, 401, 403, same-origin e 410", async () => {
  for (const route of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents", "/api/ext/compliance-documents"]) {
    const read = await api(route); assert.equal(read.status, 200, `${route}: ${read.text}`); assert.ok(Array.isArray(read.body.items)); assert.equal((await api(route, { cookie: null })).status, 401); assert.equal((await api(route, { cookie: cookieRh })).status, 403); assert.equal((await api(route, { method: "POST", body: {}, origin: "https://attacker.invalid" })).status, 403); assert.equal((await api(route, { method: "POST", body: {} })).status, 410);
  }
});
test("EXT-07 legado também minimiza metadados privados", async () => {
  const raw = JSON.stringify((await api("/api/ext/compliance-documents")).body.items); for (const field of ["storage_key", "file_url", "document_number", "declared_reference", "reference_source"]) assert.doesNotMatch(raw, new RegExp(field, "i"));
});
test("EXT-07 falha de audit_log devolve 503 e rollback total", async () => {
  await pool.query(`CREATE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext07_obligation_create' THEN RAISE EXCEPTION 'audit fail ext07'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()`);
  const title = `Obrigação rollback ${randomUUID().slice(0, 8)}`, key = idem("audit-rollback");
  try {
    const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationBody({ title }), key }); assert.equal(response.status, 503);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title=$1`, [title])).rows[0].n, 0); assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1`, [key])).rows[0].n, 0); assert.equal((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='ext07_obligation_create' AND meta->>'title'=$1`, [title])).rows[0].n, 0);
  } finally { await pool.query(`DROP TRIGGER qa_ext07_audit_fail_trg ON audit_log`); await pool.query(`DROP FUNCTION qa_ext07_audit_fail()`); }
});
test("EXT-07 falha de audit_log reverte avaliação, tarefa, evento e estado", async () => {
  const parent = await createObligation(), document = await createDocument(parent.id, { issue_date: offset(today, -15), effective_start_date: offset(today, -14), expiry_date: offset(today, -1) });
  const key = idem("audit-evaluation-rollback"), before = (await pool.query(`SELECT status::text,evaluation_date FROM ext_compliance_documents WHERE id=$1`, [document.id])).rows[0];
  await pool.query(`CREATE FUNCTION qa_ext07_evaluation_audit_fail() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext07_expiry_evaluate' THEN RAISE EXCEPTION 'audit evaluation fail ext07'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext07_evaluation_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_evaluation_audit_fail()`);
  try {
    const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key }); assert.equal(response.status, 503);
    const afterState = (await pool.query(`SELECT status::text,evaluation_date FROM ext_compliance_documents WHERE id=$1`, [document.id])).rows[0]; assert.deepEqual(afterState, before);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [document.id])).rows[0].n, 0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1`, [key])).rows[0].n, 0);
  } finally { await pool.query(`DROP TRIGGER qa_ext07_evaluation_audit_fail_trg ON audit_log`); await pool.query(`DROP FUNCTION qa_ext07_evaluation_audit_fail()`); }
});
test("EXT-07 tela /admin/compliance é servida", async () => { const response = await fetch(`${base}/admin/compliance`, { signal: AbortSignal.timeout(20000) }), text = await response.text(); assert.equal(response.status, 200); assert.match(text, /Compliance|compliance/); });
test("EXT-07 não regressa rotas e guardas EXT-08..12", async () => {
  for (const route of ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/analytics-experiments", "/api/ext/visual-tokens", "/api/ext/visual-layouts"]) assert.equal((await api(route)).status, 200, route);
  // EXT-10 é exercitada até o guard com sessão staff real sem tocar sua
  // projeção legada fora do escopo da EXT-07.
  assert.equal((await api("/api/ext/continuity-plans", { cookie: cookieRh })).status, 401);
});
