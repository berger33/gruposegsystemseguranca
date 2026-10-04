// EXT-07 — PostgreSQL real + servidor HTTP real; somente fixtures .invalid.
// Executado pelo gate scripts/qa-ext07-compliance-postgres.mjs, nunca contra o
// banco do operador (RUN_DATABASE_INTEGRATION/QA_EXT07_REQUIRE_DB controlam a
// ativação). Cobre 401/403/same-origin, forjamento, corpo/idempotência,
// obrigação/documento/validade/privacidade, tarefa (fail-closed, única,
// conclusão/cancelamento/terminal), renovação/versionamento/histórico,
// concorrência, rollback de auditoria, legado e regressão EXT-08..12.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
test("EXT-07 gate exige PostgreSQL real", () => { if (REQUIRE) assert.ok(RUN); });

let server, base, pool, ti, rh, cookieTi, cookieRh;
const idem = tag => `ext07-${tag}-${randomUUID()}`;
const yesterday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const inDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

async function wait() {
  for (let i = 0; i < 180; i++) {
    try { if ([200, 401].includes((await fetch(`${base}/api/admin/session`)).status)) return; } catch { }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}
async function staff(role) {
  const id = randomUUID(), email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`, password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA EXT07 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}
async function login(s) {
  const r = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: s.email, password: s.password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().find(x => x.startsWith("seg_admin_session=")).split(";")[0];
}
async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw } = {}) {
  const headers = { accept: "application/json", origin, ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { "idempotency-key": key === null ? "" : key || idem("request") } : {}) };
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + url, { method, headers, body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: r.status, body: data, text };
}

const obligationInput = (over = {}) => ({
  obligation_type: "licenca", title: "Licença sintética de QA", description: "Obrigação sintética usada apenas em teste automatizado.",
  declared_source: "Política interna sintética de QA, versão 1.", applicability_scope: "Unidade sintética QA",
  applicability_justification: "Aplicável por decisão sintética registrada para fins de teste.", validity_rule: "Vencimento anual contado da emissão.",
  responsible_identity: ti.id, ...over,
});
async function createObligation(over = {}, options = {}) {
  const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(over), ...options });
  assert.equal(r.status, 201, r.text);
  return r.body.obligation;
}
const documentInput = (obligationId, over = {}) => ({
  obligation_id: obligationId, title: "Referência sintética de QA", description: "Referência privada declarada apenas para teste automatizado.",
  compliance_type: "licenca", issue_date: today(), expiry_date: inDays(365), declared_reference: "Protocolo sintético QA-0001",
  reference_type: "referencia_declarada", reference_source: "Fonte sintética declarada pelo staff.", ...over,
});
async function createDocument(obligationId, over = {}, options = {}) {
  const r = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligationId, over), ...options });
  return r;
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3500 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-ext07", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2), CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_LEGACY_TOKENS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", x => logs += x);
  server.stderr.on("data", x => logs += x);
  try { await wait(); } catch (e) { throw new Error(`${e.message}\n${logs.slice(-3000)}`); }
  ti = await staff("ti");
  rh = await staff("rh");
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});
after(async () => {
  await pool?.end().catch(() => { });
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(r => setTimeout(r, 300)); server.kill("SIGKILL"); }
});
const opt = { skip: !RUN };

// --- estado inicial do cluster descartável -------------------------------
test("EXT-07 cluster recém-migrado não tem obrigação/tarefa (sem seed)", opt, async () => {
  const o = await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations`);
  const t = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks`);
  assert.equal(o.rows[0].n, 0);
  assert.equal(t.rows[0].n, 0);
});

// --- 401 vs 403, same-origin, forjamento ---------------------------------
test("EXT-07 HTTP anônimo recebe 401", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { cookie: null })).status, 401));
test("EXT-07 HTTP papel não autorizado recebe 403", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { cookie: cookieRh })).status, 403));
test("EXT-07 HTTP same-origin exigido em mutação", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(), origin: "https://attacker.invalid" })).status, 403));
test("EXT-07 HTTP chave de idempotência obrigatória", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(), key: null })).status, 400));
test("EXT-07 HTTP JSON inválido", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "{" })).status, 400));
test("EXT-07 HTTP corpo grande", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify({ x: "x".repeat(40000) }) })).status, 413));
test("EXT-07 HTTP UUID inválido no caminho", opt, async () => assert.equal((await api("/api/ext/compliance/obligations/00000000-0000-0000-0000-000000000000")).status, 400));
test("EXT-07 responsável staff ausente/forjado recusado", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ responsible_identity: randomUUID() }) })).status, 400));
test("EXT-07 responsável com papel não autorizado recusado", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ responsible_identity: rh.id }) })).status, 400));

// --- obrigação: criação, autoria, estado não forjável --------------------
test("EXT-07 criação de obrigação deriva autoria e ignora estado forjado", opt, async () => {
  const o = await createObligation({ status: "vigente", created_by_identity: randomUUID(), id: randomUUID() });
  assert.equal(o.created_by_identity, ti.id);
  assert.equal(o.status, "pendente");
  assert.notEqual(o.id, undefined);
});
test("EXT-07 retry de criação de obrigação não duplica", opt, async () => {
  const key = idem("retry-obligation"), input = obligationInput();
  const a = await api("/api/ext/compliance/obligations", { method: "POST", body: input, key });
  const b = await api("/api/ext/compliance/obligations", { method: "POST", body: input, key });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.body.replayed, true);
  assert.equal(a.body.obligation.id, b.body.obligation.id);
});
test("EXT-07 mesma chave com corpo divergente recebe 409", opt, async () => {
  const key = idem("conflict-obligation");
  await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(), key });
  const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title: "Título divergente sintético" }), key });
  assert.equal(r.status, 409);
});
test("EXT-07 obrigação exige campos obrigatórios declarados", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ applicability_justification: "curta" }) });
  assert.equal(r.status, 400);
});

// --- documento/validade/privacidade --------------------------------------
test("EXT-07 documento exige obrigação válida", opt, async () => assert.equal((await createDocument("00000000-0000-0000-0000-000000000000")).status, 400));
test("EXT-07 documento recusa vencimento anterior à emissão", opt, async () => {
  const o = await createObligation();
  const r = await createDocument(o.id, { issue_date: today(), expiry_date: yesterday() });
  assert.equal(r.status, 400);
});
test("EXT-07 documento recusa vencimento anterior ao início de vigência", opt, async () => {
  const o = await createObligation();
  const r = await createDocument(o.id, { issue_date: today(), effective_start_date: inDays(10), expiry_date: inDays(5) });
  assert.equal(r.status, 400);
});
test("EXT-07 documento recusa referência privada ausente", opt, async () => {
  const o = await createObligation();
  const r = await createDocument(o.id, { declared_reference: "" });
  assert.equal(r.status, 400);
});
test("EXT-07 criação de documento é privada, canônica e ignora forjamento de estado/IDs", opt, async () => {
  const o = await createObligation();
  const r = await createDocument(o.id, { status: "cancelada", id: randomUUID(), responsible_identity: rh.id, origin: "registro_legado", version_no: 99 });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.document.status, "vigente");
  assert.equal(r.body.document.is_private, true);
  assert.equal(r.body.document.origin, "ext07_canonica");
  assert.equal(r.body.document.version_no, 1);
  assert.equal(r.body.document.responsible_identity, ti.id);
});
test("EXT-07 recusa segundo documento corrente para a mesma obrigação (exige renovação)", opt, async () => {
  const o = await createObligation();
  const first = await createDocument(o.id); assert.equal(first.status, 201);
  const second = await createDocument(o.id, { declared_reference: "Protocolo sintético QA-0002" });
  assert.equal(second.status, 409);
  assert.match(second.body.canonical_action, /\/renew$/);
});
test("EXT-07 projeção de listagem não expõe storage_key, file_url nem número documental", opt, async () => {
  const body = (await api("/api/ext/compliance/documents")).body;
  const raw = JSON.stringify(body);
  for (const field of ["storage_key", "file_url", "document_number", "declared_reference"]) assert.doesNotMatch(raw, new RegExp(field));
});
test("EXT-07 detalhe autorizado usa allowlist e ainda exclui storage_key/file_url", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  const detail = await api(`/api/ext/compliance/documents/${created.body.document.id}`);
  assert.equal(detail.status, 200);
  assert.ok("declared_reference" in detail.body.document);
  assert.ok(!("storage_key" in detail.body.document));
  assert.ok(!("file_url" in detail.body.document));
});
test("EXT-07 documento declara fronteira referência versus arquivo real", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  assert.match(created.body.file_boundary, /não representa upload, bytes, checksum/);
});
test("EXT-07 banco recusa sobrescrita destrutiva do documento canônico", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET expiry_date = $2 WHERE id = $1`, [created.body.document.id, inDays(1)]), /immutable/);
});

// --- renovação / versionamento / histórico --------------------------------
test("EXT-07 renovação exige justificativa declarada", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  const r = await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today(), expiry_date: inDays(730), declared_reference: "Protocolo renovado QA", reference_type: "referencia_declarada", renewal_justification: "curta" } });
  assert.equal(r.status, 400);
});
test("EXT-07 renovação cria nova versão vinculada e preserva a anterior", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  const renewal = await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today(), expiry_date: inDays(730), declared_reference: "Protocolo renovado QA", reference_type: "referencia_declarada", renewal_justification: "Renovação sintética devidamente justificada para teste." } });
  assert.equal(renewal.status, 201, renewal.text);
  assert.equal(renewal.body.document.version_no, 2);
  assert.equal(renewal.body.superseded_document_id, created.body.document.id);
  const old = await pool.query(`SELECT superseded_at, superseded_by_identity, issue_date FROM ext_compliance_documents WHERE id = $1`, [created.body.document.id]);
  assert.ok(old.rows[0].superseded_at);
  assert.equal(old.rows[0].superseded_by_identity, ti.id);
  const current = await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id = $1 AND origin = 'ext07_canonica' AND superseded_at IS NULL`, [o.id]);
  assert.equal(current.rows[0].n, 1);
});
test("EXT-07 recusa renovar documento já substituído (impede ciclo/ramificação)", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today(), expiry_date: inDays(730), declared_reference: "Protocolo renovado QA2", reference_type: "referencia_declarada", renewal_justification: "Renovação sintética válida para o teste." } });
  const again = await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today(), expiry_date: inDays(1000), declared_reference: "Protocolo renovado QA3", reference_type: "referencia_declarada", renewal_justification: "Nova tentativa sintética de renovação duplicada." } });
  assert.equal(again.status, 409);
});
test("EXT-07 banco impede ramificação de versão (replacement_of único por alvo)", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  const renewal = await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today(), expiry_date: inDays(730), declared_reference: "Protocolo renovado QA4", reference_type: "referencia_declarada", renewal_justification: "Renovação sintética para teste de ramificação." } });
  assert.equal(renewal.status, 201, renewal.text);
  await assert.rejects(pool.query(
    `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin,version_no,replacement_of,renewal_justification)
     VALUES($1,'Ramificação sintética','Tentativa de ramificação sintética.', 'licenca','vigente','QA EXT07 ti',$2,CURRENT_DATE,CURRENT_DATE,$3,'regra sintética',CURRENT_DATE,'referencia_declarada','Protocolo ramificado',true,$2,$4,'ext07_canonica',3,$5,'Justificativa sintética válida apenas para exercitar o índice único.')`,
    [`COMP-EXT-${today().replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`, ti.id, inDays(999), o.id, created.body.document.id]
  ), /duplicate key|unique/i);
});
test("EXT-07 histórico de versões é consultável em ordem", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id);
  await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today(), expiry_date: inDays(730), declared_reference: "Protocolo renovado QA5", reference_type: "referencia_declarada", renewal_justification: "Renovação sintética registrada para histórico." } });
  const detail = await api(`/api/ext/compliance/obligations/${o.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.documents.length, 2);
  assert.deepEqual(detail.body.documents.map(d => d.version_no), [1, 2]);
});

// --- avaliação de vencimento / tarefa --------------------------------------
test("EXT-07 avaliação não cria tarefa quando nada está vencido", opt, async () => {
  const o = await createObligation();
  await createDocument(o.id);
  const before = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks`);
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(r.status, 200);
  const after = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks`);
  assert.equal(after.rows[0].n, before.rows[0].n);
});
test("EXT-07 avaliação usa a data do servidor e nunca a do cliente", opt, async () => {
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "1999-01-01" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.evaluation_date, today());
  assert.equal(r.body.source, "server_clock");
});
test("EXT-07 vencimento gera tarefa única vinculada a obrigação/documento/período", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id, { issue_date: inDays(-400), expiry_date: yesterday() });
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(r.status, 200);
  assert.ok(r.body.tasks_created >= 1);
  const task = await pool.query(`SELECT * FROM ext_compliance_tasks WHERE document_id = $1`, [created.body.document.id]);
  assert.equal(task.rowCount, 1);
  assert.equal(task.rows[0].obligation_id, o.id);
  assert.equal(task.rows[0].responsible_identity, ti.id);
  assert.ok(task.rows[0].rule);
  assert.ok(task.rows[0].facts.evaluation_date);
  const doc = await pool.query(`SELECT status::text s FROM ext_compliance_documents WHERE id = $1`, [created.body.document.id]);
  assert.equal(doc.rows[0].s, "vencida");
});
test("EXT-07 reavaliação não duplica a tarefa do mesmo documento/período", opt, async () => {
  const rows = await pool.query(`SELECT document_id FROM ext_compliance_tasks LIMIT 1`);
  const documentId = rows.rows[0].document_id;
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("second-eval") });
  const count = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id = $1`, [documentId]);
  assert.equal(count.rows[0].n, 1);
});
test("EXT-07 falha fechada: sem responsável ativo não cria tarefa", opt, async () => {
  const inactiveResponsible = await staff("ti");
  const o = await createObligation({ responsible_identity: inactiveResponsible.id });
  const created = await createDocument(o.id, { issue_date: inDays(-400), expiry_date: yesterday() });
  await pool.query(`UPDATE auth_identities SET status = 'suspended' WHERE id = $1`, [inactiveResponsible.id]);
  const r = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("blocked-eval") });
  assert.equal(r.status, 200);
  assert.ok(r.body.blocked_missing_responsible >= 1);
  const task = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id = $1`, [created.body.document.id]);
  assert.equal(task.rows[0].n, 0);
});
test("EXT-07 concorrência de avaliação produz uma única tarefa", opt, async () => {
  const o = await createObligation();
  const created = await createDocument(o.id, { issue_date: inDays(-400), expiry_date: yesterday() });
  await Promise.all([
    api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("race-a") }),
    api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("race-b") }),
  ]);
  const task = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id = $1`, [created.body.document.id]);
  assert.equal(task.rows[0].n, 1);
});

// --- transições de tarefa ---------------------------------------------------
async function freshTask() {
  const o = await createObligation();
  const created = await createDocument(o.id, { issue_date: inDays(-400), expiry_date: yesterday() });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key: idem("task-fixture") });
  const row = (await pool.query(`SELECT id FROM ext_compliance_tasks WHERE document_id = $1`, [created.body.document.id])).rows[0];
  return row.id;
}
test("EXT-07 tarefa inicia e exige responsável/resultado para concluir", opt, async () => {
  const id = await freshTask();
  const noResult = await api(`/api/ext/compliance/tasks/${id}/complete`, { method: "POST", body: {} });
  assert.equal(noResult.status, 400);
  const start = await api(`/api/ext/compliance/tasks/${id}/start`, { method: "POST", body: {} });
  assert.equal(start.status, 200);
  assert.equal(start.body.task.status, "em_andamento");
  const complete = await api(`/api/ext/compliance/tasks/${id}/complete`, { method: "POST", body: { result: "Resultado sintético da verificação concluída." } });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.task.status, "concluida");
});
test("EXT-07 terminal de tarefa não reabre silenciosamente (API e banco)", opt, async () => {
  const id = await freshTask();
  await api(`/api/ext/compliance/tasks/${id}/complete`, { method: "POST", body: { result: "Resultado sintético suficiente para concluir." } });
  const reopen = await api(`/api/ext/compliance/tasks/${id}/start`, { method: "POST", body: {} });
  assert.equal(reopen.status, 409);
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status = 'aberta' WHERE id = $1`, [id]), /immutable/);
});
test("EXT-07 cancelamento exige justificativa e fica terminal", opt, async () => {
  const id = await freshTask();
  const shortJustification = await api(`/api/ext/compliance/tasks/${id}/cancel`, { method: "POST", body: { justification: "curta" } });
  assert.equal(shortJustification.status, 400);
  const cancel = await api(`/api/ext/compliance/tasks/${id}/cancel`, { method: "POST", body: { justification: "Cancelamento sintético devidamente justificado." } });
  assert.equal(cancel.status, 200);
  const completeAfterCancel = await api(`/api/ext/compliance/tasks/${id}/complete`, { method: "POST", body: { result: "Tentativa terminal com resultado sintético." } });
  assert.equal(completeAfterCancel.status, 409);
});
test("EXT-07 retry de transição de tarefa não duplica evento", opt, async () => {
  const id = await freshTask();
  const key = idem("task-retry");
  const a = await api(`/api/ext/compliance/tasks/${id}/start`, { method: "POST", body: {}, key });
  const b = await api(`/api/ext/compliance/tasks/${id}/start`, { method: "POST", body: {}, key });
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(b.body.replayed, true);
  const events = await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE task_id = $1 AND idempotency_key = $2`, [id, key]);
  assert.equal(events.rows[0].n, 1);
});

// --- agregados / eventos imutáveis -----------------------------------------
test("EXT-07 agregado de documentos distingue ausência de zero e declara fonte", opt, async () => {
  const b = (await api("/api/ext/compliance/documents")).body;
  assert.equal(b.aggregate.source, "ext_compliance_documents");
  assert.equal(typeof b.aggregate.denominator, "number");
  assert.ok("absence" in b.aggregate);
});
test("EXT-07 evento é imutável", opt, async () => {
  const e = await pool.query(`SELECT id FROM ext_compliance_events ORDER BY created_at DESC LIMIT 1`);
  await assert.rejects(pool.query(`DELETE FROM ext_compliance_events WHERE id = $1`, [e.rows[0].id]), /immutable/);
});

// --- legado ------------------------------------------------------------------
test("EXT-07 legado distingue 401/403/410 e preserva leitura com items", opt, async () => {
  assert.equal((await api("/api/ext/compliance-documents", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance-documents", { cookie: cookieRh })).status, 403);
  const read = await api("/api/ext/compliance-documents");
  assert.equal(read.status, 200);
  assert.ok(Array.isArray(read.body.items));
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: {} })).status, 410);
});

// --- falha de auditoria / rollback -------------------------------------------
test("EXT-07 falha de audit_log causa 503 e rollback (obrigação inalterada)", opt, async () => {
  await pool.query(`CREATE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER AS $$ BEGIN IF NEW.action = 'ext07_obligation_create' THEN RAISE EXCEPTION 'audit fail'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()`);
  const key = idem("rollback");
  try {
    const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title: "Rollback sintético auditável" }), key });
    assert.equal(r.status, 503);
    const events = await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key = $1`, [key]);
    assert.equal(events.rows[0].n, 0);
    const obligations = await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title = 'Rollback sintético auditável'`);
    assert.equal(obligations.rows[0].n, 0);
  } finally {
    await pool.query(`DROP TRIGGER qa_ext07_audit_fail_trg ON audit_log`);
    await pool.query(`DROP FUNCTION qa_ext07_audit_fail()`);
  }
});

// --- UI / ausência de rota pública -------------------------------------------
test("EXT-07 UI /admin/compliance real", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`);
  const t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /Compliance/);
});
test("EXT-07 não existe rota pública de compliance", opt, async () => {
  assert.equal((await fetch(`${base}/api/public/compliance`)).status, 404);
  assert.equal((await fetch(`${base}/cliente/app/compliance`)).status, 404);
});

// --- regressão EXT-08..12 (não dedicada; smoke de não-quebra) ---------------
test("EXT-07 não regride rotas legadas EXT-08..12 (401 anônimo preservado)", opt, async () => {
  for (const path of ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/continuity-plans", "/api/ext/analytics-experiments", "/api/ext/visual-tokens", "/api/ext/visual-layouts"]) {
    assert.equal((await api(path, { cookie: null })).status, 401, path);
  }
});
