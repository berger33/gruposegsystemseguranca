// EXT-07 — jornada canônica por HTTP real contra PostgreSQL real.
// Cluster descartável criado pelo gate (scripts/qa-ext07-compliance-postgres.mjs);
// fixtures 100% sintéticas em domínios .invalid. Sem banco real, SMTP, storage,
// aceite humano ou ator externo. Rode com RUN_DATABASE_INTEGRATION=1 e DATABASE_URL.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
test("EXT-07 gate exige PostgreSQL real", () => { if (REQUIRE) assert.ok(RUN, "RUN_DATABASE_INTEGRATION/DATABASE_URL ausentes"); });

let server, base, pool, ti, ti2, rh, cookieTi, cookieRh, serverLogs = "";
const idem = (t) => `ext07-${t}-${randomUUID()}`;
const isoAdd = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const dbToday = async () => (await pool.query("SELECT CURRENT_DATE::text AS t")).rows[0].t;
const isoDate = (v) => (v instanceof Date ? v.toLocaleDateString("sv-SE") : String(v).slice(0, 10));
const waitServer = async () => { for (let i = 0; i < 240; i++) { try { const r = await fetch(`${base}/api/admin/session`); if ([200, 401, 405].includes(r.status)) return; } catch {} await new Promise(r => setTimeout(r, 400)); } throw new Error("server_did_not_start"); };
const mkstaff = async (role, tag) => { const id = randomUUID(), email = `ext07-${role}-${tag}-${id.slice(0, 8)}@example.invalid`, password = "Senha-Sintetica-9!"; await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA EXT07 ${role} ${tag}`]); await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]); await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]); return { id, email, password }; };
const login = async (s) => { const r = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: s.email, password: s.password }) }); assert.equal(r.status, 200, "login staff real"); return r.headers.getSetCookie().find(x => x.startsWith("seg_admin_session=")).split(";")[0]; };
async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw, timeoutMs = 15000 } = {}) {
  const headers = { accept: "application/json", origin };
  if (cookie) headers.cookie = cookie;
  if (method !== "GET") headers["idempotency-key"] = key === null ? "" : key || idem("request");
  if (raw !== undefined || body !== undefined) headers["content-type"] = "application/json";
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort("qa_timeout"), timeoutMs);
  try { const r = await fetch(base + url, { method, headers, body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw, signal: ctrl.signal }); const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; } return { status: r.status, body: data, text }; }
  finally { clearTimeout(timer); }
}

const obConfig = (over = {}) => ({
  obligation_type: "licenca", title: "Licença operacional sintética nº 1",
  description: "Descrição sintética suficientemente detalhada da obrigação.",
  declared_source: "Fonte declarada sintética — registro interno nº 7 (exemplo.invalid), não é validação jurídica.",
  applicability_scope: "matriz_sintetica_qa",
  applicability_justification: "Justificativa sintética de aplicabilidade com detalhamento mínimo.",
  validity_rule: "renovacao_anual_apos_emissao", responsible_identity: ti.id, ...over,
});
async function createObligation(over = {}, opts = {}) {
  const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig(over), ...opts });
  assert.equal(r.status, 201, r.text);
  return r.body.obligation;
}
async function createDocument(obligation, over = {}, opts = {}) {
  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: { obligation_id: obligation.id, title: "Documento sintético versão inicial", description: "Descrição sintética do documento inicial.", issue_date: over.__today, effective_start_date: over.__today, expiry_date: over.__expiry || isoAdd(over.__today, 300), compliance_type: "licenca", reference_type: "referencia_declarada", declared_reference: "REF-SINT-0001 protocolo interno", document_number: "QA-99881234", issuer: "Emissor Sintético QA", ...over },
    ...opts,
  });
  return r;
}
async function insertSqlDoc(obligationId, { status, issue, expiry, reference = "REF-SQL-FIXTURE" }) {
  const protocol = `COMP-EXT-${issue.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const r = await pool.query(
    `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,origin,obligation_id,responsible_identity,is_private,validity_rule,reference_type,declared_reference,issue_date,effective_start_date,expiry_date,created_by_identity,version_no)
     VALUES($1,'Documento fixture SQL','Descrição fixture SQL suficientemente longa.','licenca',$2,'ext07_canonica',$3,$4,true,'renovacao_anual_apos_emissao','referencia_declarada',$5,$6,$6,$7,$8,1) RETURNING id,protocol`,
    [protocol, status, obligationId, ti.id, reference, issue, expiry, ti.id]);
  return r.rows[0];
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3400 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-ext07", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2), CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_LEGACY_TOKENS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverLogs = ""; server.stdout.on("data", c => serverLogs += c); server.stderr.on("data", c => serverLogs += c);
  try { await waitServer(); } catch (e) { throw new Error(`${e.message}\n${serverLogs.slice(-3000)}`); }
  ti = await mkstaff("ti", "a"); ti2 = await mkstaff("ti", "b"); rh = await mkstaff("rh", "a");
  cookieTi = await login(ti); cookieRh = await login(rh);
  // Fixture legado (086) com metadados sensíveis: deve permanecer registro_legado
  // e nunca aparecer integralmente em listagem alguma.
  globalThis.__legacySecret = `segredo-${randomUUID().slice(0, 8)}`;
  globalThis.__legacyNumber = `LEGADO-${randomUUID().slice(0, 8).toUpperCase()}`;
  const protocol = `COMP-EXT-20200101-${randomUUID().slice(0, 4).toUpperCase()}`;
  const legacy = await pool.query(
    `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,file_name,file_url,storage_key,issue_date,expiry_date,origin,is_private,created_by_identity)
     VALUES($1,'Documento legado sintético','Descrição legada sintética suficiente.','licenca','vigente',$3,'Emissor Sintético','seguro.pdf',$4,$5,'2020-01-01','2021-01-01','registro_legado',true,$2) RETURNING id`,
    [protocol, ti.id, globalThis.__legacyNumber, `https://arquivos.invalid/privado/${globalThis.__legacySecret}.pdf`, `s3://bucket.invalid/${globalThis.__legacySecret}`]);
  globalThis.__legacyDocId = legacy.rows[0].id;
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(r => setTimeout(r, 400)); server.kill("SIGKILL"); }
  const logPath = process.env.QA_EXT07_SERVER_LOG;
  if (logPath) { try { await writeFile(logPath, serverLogs || "", "utf8"); } catch {} }
});
const opt = { skip: !RUN };

// ---------------- guardas de entrada ----------------
test("EXT-07 anônimo recebe 401 (com resposta, sem pendurar)", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { cookie: null, timeoutMs: 6000 });
  assert.equal(r.status, 401);
  const m = await api("/api/ext/compliance/obligations", { method: "POST", cookie: null, body: obConfig(), timeoutMs: 6000 });
  assert.equal(m.status, 401);
});
test("EXT-07 papel staff não autorizado recebe 403", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/compliance/documents", { cookie: cookieRh })).status, 403);
});
test("EXT-07 cookie forjado não vira sessão", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: "seg_admin_session=forged.invalid" })).status, 401);
});
test("EXT-07 não mistura fontes de login (cookie de cliente não autoriza)", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: "seg_client_session=qualquer-valor" })).status, 401);
});
test("EXT-07 same-origin só em mutações", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { origin: "https://attacker.invalid" })).status, 200);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", origin: "https://attacker.invalid", body: obConfig() })).status, 403);
  assert.equal((await api("/api/ext/compliance/evaluate", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403);
});
test("EXT-07 chave de idempotência obrigatória nas mutações", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig(), key: null })).status, 400);
});
test("EXT-07 JSON inválido 400, objeto raiz obrigatório e corpo único", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "{" })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", raw: "[1,2]" })).status, 400);
});
test("EXT-07 corpo grande recebe 413", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify({ x: "y".repeat(140000) }) });
  assert.equal(r.status, 413);
});
test("EXT-07 UUID inválido recebe 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: { obligation_id: "nao-uuid" } })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations/not-a-uuid")).status, 400);
  assert.equal((await api("/api/ext/compliance/tasks/not-a-uuid/start", { method: "POST", body: {} })).status, 400, "id fora do padrão UUID é bad request também nas rotações");
});

// ---------------- obrigação ----------------
test("EXT-07 obrigação exige campos e responsável staff ativo e autorizado", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ declared_source: "" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ validity_rule: "" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ responsible_identity: randomUUID() }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ responsible_identity: rh.id }) })).status, 400);
});
test("EXT-07 criação de obrigação deriva autoria/estado/timestamps e audita", opt, async () => {
  const o = await createObligation({ id: randomUUID(), created_by_identity: rh.id, status: "encerrada", created_at: "1999-01-01T00:00:00Z", criticality: "alta" });
  assert.equal(o.created_by_identity, ti.id);
  assert.equal(o.status, "pendente");
  assert.equal(o.criticality, "alta");
  assert.notEqual(String(o.created_at).slice(0, 4), "1999");
  const audit = await pool.query(`SELECT action, actor FROM audit_log WHERE action='ext07_obligation_create' AND target=$1`, [o.id]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].actor, ti.id);
});
test("EXT-07 listagem de obrigações declara fonte e distinguir ausência de zero", opt, async () => {
  const b = (await api("/api/ext/compliance/obligations")).body;
  assert.equal(b.source, "ext07_canonica");
  assert.equal(typeof b.denominator, "number");
  assert.ok("absence_is_not_zero" in b);
});

// ---------------- documento / validade / privacidade ----------------
test("EXT-07 documento exige obrigação, referência declarada e tipo válido", opt, async () => {
  const o = await createObligation();
  const today = await dbToday();
  assert.equal((await api("/api/ext/compliance/documents", { method: "POST", body: { obligation_id: o.id, title: "Doc sem referência", description: "Descrição sintética suficiente aqui.", issue_date: today, expiry_date: isoAdd(today, 30), compliance_type: "licenca" } })).status, 400);
  const badType = await createDocument(o, { compliance_type: "nuclear" , __today: today });
  assert.equal(badType.status, 400);
});
test("EXT-07 segunda cadeia na mesma obrigação é recusada (use renovação)", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética cadeia única" });
  const today = await dbToday();
  const first = await createDocument(o, { __today: today });
  assert.equal(first.status, 201, first.text);
  const second = await createDocument(o, { __today: today, declared_reference: "REF-SINT-SEGUNDA" });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "chain_exists_use_renew");
});
test("EXT-07 documento é privado, reference-only, sem campos de arquivo", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética privacidade" });
  const today = await dbToday();
  const created = await createDocument(o, { __today: today, storage_key: "s3://bucket.invalid/chave", file_url: "https://arquivos.invalid/x.pdf", file_name: "x.pdf", is_private: false });
  assert.equal(created.status, 201, created.text);
  const row = (await pool.query(`SELECT is_private, storage_key, file_url, file_name, declared_reference, version_no, origin FROM ext_compliance_documents WHERE id=$1`, [created.body.document.id])).rows[0];
  assert.equal(row.is_private, true);
  assert.equal(row.storage_key, null);
  assert.equal(row.file_url, null);
  assert.equal(row.file_name, null);
  assert.ok(row.declared_reference);
  assert.equal(row.version_no, 1);
  assert.equal(row.origin, "ext07_canonica");
});
test("EXT-07 listagem canônica é minimizada e declara fronteira de arquivo", opt, async () => {
  const r = await api("/api/ext/compliance/documents");
  assert.equal(r.status, 200);
  assert.equal(r.body.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  const raw = JSON.stringify(r.body.items);
  for (const forbidden of ["storage_key", "file_url", "file_name", "document_number", "declared_reference", "QA-99881234"])
    assert.ok(!raw.includes(forbidden), `listagem não deve expor ${forbidden}`);
});
test("EXT-07 detalhe é allowlist com número mascarado e sem storage", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética detalhe" });
  const today = await dbToday();
  const created = await createDocument(o, { __today: today });
  assert.equal(created.status, 201);
  const d = (await api(`/api/ext/compliance/documents/${created.body.document.id}`)).body;
  assert.equal(d.document.document_number, undefined);
  assert.equal(d.document.document_number_masked, "…1234");
  assert.equal(d.document.storage_key, undefined);
  assert.equal(d.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  assert.equal(d.document.reference.is_file, false);
  assert.ok(globalThis.__legacyDocId, "fixture legado existe");
  assert.equal((await api(`/api/ext/compliance/documents/${globalThis.__legacyDocId}`)).status, 404);
});
test("EXT-07 validade: formato/calendário, ordem e estado temporal coerente", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética validade" });
  const today = await dbToday();
  for (const bad of ["2026-02-31", "31/12/2026", "hoje"]) {
    const r = await createDocument(o, { __today: today, issue_date: bad });
    assert.equal(r.status, 400, `issue=${bad}`);
  }
  assert.equal((await createDocument(o, { __today: today, issue_date: isoAdd(today, 10), __expiry: isoAdd(today, 5) })).status, 400);
  assert.equal((await createDocument(o, { __today: today, issue_date: today, effective_start_date: isoAdd(today, 6), __expiry: isoAdd(today, 5) })).status, 400);
  assert.equal((await createDocument(o, { __today: today, issue_date: isoAdd(today, -40), __expiry: isoAdd(today, -10) })).status, 400, "vigente com validade vencida é rejeitado");
  const r = await createDocument(o, { __today: today, __expiry: today });
  assert.equal(r.status, 201, `vencimento hoje é admitido (evaluate o vence): ${r.text.slice(0, 120)}`);
});
test("EXT-07 PostgreSQL impõe guarda temporal e de referência (sem API)", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética guarda DB" });
  const today = await dbToday();
  await assert.rejects(insertSqlDoc(o.id, { status: "vigente", issue: isoAdd(today, -40), expiry: isoAdd(today, -10) }), /expired validity|vigente/i);
  await assert.rejects(insertSqlDoc(o.id, { status: "vencida", issue: today, expiry: isoAdd(today, 30) }), /arbitrary expired/i);
  const ok = await insertSqlDoc(o.id, { status: "vencida", issue: isoAdd(today, -400), expiry: isoAdd(today, -30) });
  assert.ok(ok.id);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET is_private=false WHERE id=$1`, [ok.id]), /private|immutable/i);
  await assert.rejects(pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,origin,obligation_id,responsible_identity,is_private,validity_rule,reference_type,declared_reference,issue_date,effective_start_date,expiry_date,created_by_identity,file_url) VALUES($1,'Doc com arquivo','Descrição com arquivo suficiente.','licenca','vigente','ext07_canonica',$2,$3,true,'regra_declarada','referencia_declarada','REF-ARQ',$4,$4,$5,$3,'https://arquivos.invalid/x.pdf')`, [`COMP-EXT-${today.replaceAll("-", "")}-ARQ1`, o.id, ti.id, today, isoAdd(today, 30)]), /declared reference, not a stored file/i);
});

// ---------------- avaliação temporal e tarefas ----------------
test("EXT-07 vencimento gera tarefa única com regra, fatos e data-base do servidor", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética vencimento" });
  const today = await dbToday();
  const doc = await insertSqlDoc(o.id, { status: "vencida", issue: isoAdd(today, -400), expiry: isoAdd(today, -15) });
  const ev1 = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(ev1.status, 200, ev1.text);
  assert.equal(ev1.body.source, "postgres_current_date");
  assert.equal(ev1.body.evaluation_date, today);
  const tasks = await pool.query(`SELECT *, evaluation_date::text AS evaluation_date_iso, due_date::text AS due_date_iso FROM ext_compliance_tasks WHERE document_id=$1`, [doc.id]);
  assert.equal(tasks.rowCount, 1);
  const t = tasks.rows[0];
  assert.equal(t.rule, "expiry_at_or_before_evaluation_date");
  assert.equal(t.evaluation_date_iso, today);
  assert.equal(t.due_date_iso, isoAdd(today, -15));
  assert.equal(t.facts.source, "postgres_current_date");
  assert.equal(t.facts.expiry_date, isoAdd(today, -15));
  assert.equal(t.responsible_identity, ti.id);
  const ev2 = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(ev2.body.tasks_created, 0);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [doc.id])).rows[0].n, 1);
  globalThis.__taskFlow = t.id; globalThis.__docFlow = doc.id; globalThis.__obFlow = o.id;
});
test("EXT-07 avaliação rejeita relógio do cliente", opt, async () => {
  const today = await dbToday();
  assert.equal((await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2030-12-31" } })).status, 400);
  assert.equal((await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2020-01-01" } })).status, 400);
  const badFormat = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "semana que vem" } });
  assert.equal(badFormat.status, 400);
  const same = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: today } });
  assert.equal(same.status, 200);
  assert.equal(same.body.evaluation_date, today);
  const forged = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE evaluation_date IN ('2030-12-31','2020-01-01')`);
  assert.equal(forged.rows[0].n, 0);
});
test("EXT-07 avaliação marca a_vencer dentro da janela sem criar tarefa", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética janela", renewal_lead_days: 30 });
  const today = await dbToday();
  const created = await createDocument(o, { __today: today, __expiry: isoAdd(today, 10) });
  assert.equal(created.status, 201, created.text);
  const ev = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(ev.status, 200);
  const row = (await pool.query(`SELECT status, evaluation_date::text AS evaluation_date_iso FROM ext_compliance_documents WHERE id=$1`, [created.body.document.id])).rows[0];
  assert.equal(row.status, "a_vencer");
  assert.equal(row.evaluation_date_iso, today);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [created.body.document.id])).rows[0].n, 0);
});
test("EXT-07 avaliação falha fechado sem responsável staff ativo", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética fail-closed", responsible_identity: ti2.id });
  const today = await dbToday();
  const doc = await insertSqlDoc(o.id, { status: "vencida", issue: isoAdd(today, -400), expiry: isoAdd(today, -9) });
  await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`, [ti2.id]);
  const ev = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(ev.status, 409);
  assert.equal(ev.body.fail_closed, true);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [doc.id])).rows[0].n, 0);
  await pool.query(`UPDATE auth_identities SET status='active' WHERE id=$1`, [ti2.id]);
  const ev2 = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(ev2.status, 200, ev2.text);
  assert.equal((await pool.query(`SELECT count(*)::int n, status FROM ext_compliance_tasks WHERE document_id=$1 GROUP BY status`, [doc.id])).rows[0].n, 1);
});
test("EXT-07 avaliação não toca em versão substituída nem em cancelada", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética cadeia eval" });
  const today = await dbToday();
  const created = await createDocument(o, { __today: today, __expiry: isoAdd(today, 5) });
  assert.equal(created.status, 201);
  const renewed = await api(`/api/ext/compliance/documents/${created.body.document.id}/renew`, { method: "POST", body: { issue_date: today, expiry_date: isoAdd(today, 320), reference_type: "renovacao_declarada", declared_reference: "REF-SINT-RENOV-EVAL", justification: "Renovação preventiva sintética formal." } });
  assert.equal(renewed.status, 201, renewed.text);
  const canceled = await insertSqlDoc(globalThis.__obFlow, { status: "cancelada", issue: isoAdd(today, -300), expiry: isoAdd(today, -20) });
  const ev = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(ev.status, 200, `cancelada não derruba a avaliação: ${ev.text.slice(0, 120)}`);
  const oldRow = (await pool.query(`SELECT status FROM ext_compliance_documents WHERE id=$1`, [created.body.document.id])).rows[0];
  assert.equal(oldRow.status, "vigente", "versão substituída não é rebaixada");
  const cancRow = (await pool.query(`SELECT status FROM ext_compliance_documents WHERE id=$1`, [canceled.id])).rows[0];
  assert.equal(cancRow.status, "cancelada");
});

// ---------------- tarefa: máquina de estados ----------------
test("EXT-07 tarefa inicia, conclui com resultado e não reabre terminal", opt, async () => {
  const tid = globalThis.__taskFlow;
  const s1 = await api(`/api/ext/compliance/tasks/${tid}/start`, { method: "POST", body: {} });
  assert.equal(s1.status, 200, s1.text);
  assert.equal(s1.body.task.status, "em_andamento");
  const c0 = await api(`/api/ext/compliance/tasks/${tid}/complete`, { method: "POST", body: { result: "curto" } });
  assert.equal(c0.status, 409);
  const c1 = await api(`/api/ext/compliance/tasks/${tid}/complete`, { method: "POST", body: { result: "Renovada a referência e registrada a nova versão sintética." } });
  assert.equal(c1.status, 200, c1.text);
  const reopen = await api(`/api/ext/compliance/tasks/${tid}/start`, { method: "POST", body: {} });
  assert.equal(reopen.status, 409);
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1`, [tid]), /terminal compliance task is immutable/);
  const back = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE id=$1 AND status='concluida' AND completed_at IS NOT NULL`, [tid]);
  assert.equal(back.rows[0].n, 1);
});
test("EXT-07 cancelamento exige justificativa e fica terminal", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética cancelamento" });
  const today = await dbToday();
  const doc = await insertSqlDoc(o.id, { status: "vencida", issue: isoAdd(today, -400), expiry: isoAdd(today, -11) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const tid = (await pool.query(`SELECT id FROM ext_compliance_tasks WHERE document_id=$1`, [doc.id])).rows[0].id;
  assert.equal((await api(`/api/ext/compliance/tasks/${tid}/cancel`, { method: "POST", body: { justification: "curta" } })).status, 400);
  const ok = await api(`/api/ext/compliance/tasks/${tid}/cancel`, { method: "POST", body: { justification: "Cancelada por substituição formal sintética." } });
  assert.equal(ok.status, 200);
  assert.equal((await api(`/api/ext/compliance/tasks/${tid}/complete`, { method: "POST", body: { result: "Resultado pós-terminal sintético." } })).status, 409);
});
test("EXT-07 conclusão exige responsável staff ativo", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética conc-resp", responsible_identity: ti2.id });
  const today = await dbToday();
  const doc = await insertSqlDoc(o.id, { status: "vencida", issue: isoAdd(today, -400), expiry: isoAdd(today, -8) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const tid = (await pool.query(`SELECT id, responsible_identity FROM ext_compliance_tasks WHERE document_id=$1`, [doc.id])).rows[0];
  assert.equal(tid.responsible_identity, ti2.id);
  await pool.query(`UPDATE auth_identities SET status='disabled' WHERE id=$1`, [ti2.id]);
  assert.equal((await api(`/api/ext/compliance/tasks/${tid.id}/complete`, { method: "POST", body: { result: "Resultado sintético suficiente aqui." } })).status, 409);
  await pool.query(`UPDATE auth_identities SET status='active' WHERE id=$1`, [ti2.id]);
  assert.equal((await api(`/api/ext/compliance/tasks/${tid.id}/complete`, { method: "POST", body: { result: "Resultado sintético suficiente aqui." } })).status, 200);
});
test("EXT-07 PATCH arbitrário não existe na canônica", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents", { method: "PATCH", body: { id: randomUUID(), status: "cancelada" } })).status, 405);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "PATCH", body: { id: randomUUID(), status: "encerrada" } })).status, 405);
});

// ---------------- idempotência / transação / auditoria ----------------
test("EXT-07 retry idêntico não duplica e devolve 200", opt, async () => {
  const key = idem("retry"); const body = obConfig({ title: "Obrigação sintética retry" });
  const a = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  const b = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  assert.equal(a.status, 201); assert.equal(b.status, 200);
  assert.equal(a.body.obligation.id, b.body.obligation.id);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title='Obrigação sintética retry'`)).rows[0].n, 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1`, [key])).rows[0].n, 1);
});
test("EXT-07 mesma chave com corpo divergente recebe 409, inclusive aninhado", opt, async () => {
  const key1 = idem("dv-flat");
  await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação sintética divergente" }), key: key1 });
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação divergida sintética" }), key: key1 })).status, 409);
  const key2 = idem("dv-nested");
  const first = await api("/api/ext/compliance/obligations", { method: "POST", body: { ...obConfig({ title: "Obrigação sintética aninhada" }), contexto: { a: 1 } }, key: key2 });
  assert.equal(first.status, 201);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: { ...obConfig({ title: "Obrigação sintética aninhada" }), contexto: { b: 2 } }, key: key2 })).status, 409);
});
test("EXT-07 concorrência real não duplica obrigação nem documento", opt, async () => {
  const key = idem("race-ob");
  const rs = await Promise.all([1, 2, 3].map(() => api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação sintética corrida" }), key })));
  assert.deepEqual([...new Set(rs.map(r => r.body.obligation.id))].length, 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title='Obrigação sintética corrida'`)).rows[0].n, 1);
  const o = rs[0].body.obligation;
  const today = await dbToday();
  const key2 = idem("race-doc");
  const ds = await Promise.all([1, 2].map(() => createDocument(o, { __today: today }, { key: key2 })));
  const ids = [...new Set(ds.map(d => d.body?.document?.id).filter(Boolean))];
  assert.equal(ids.length, 1, ds.map(d => d.status).join(","));
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1`, [o.id])).rows[0].n, 1);
});
test("EXT-07 falha de audit_log causa 503, rollback e nada escrito", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ext07_obligation_create' THEN RAISE EXCEPTION 'qa_ext07_audit_fail'; END IF; RETURN NEW; END $$`);
  await pool.query(`DROP TRIGGER IF EXISTS qa_ext07_audit_fail_trg ON audit_log; CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()`);
  const key = idem("audfail");
  try {
    const r = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação sintética rollback" }), key });
    assert.equal(r.status, 503);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title='Obrigação sintética rollback'`)).rows[0].n, 0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1`, [key])).rows[0].n, 0);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext07_audit_fail_trg ON audit_log; DROP FUNCTION IF EXISTS qa_ext07_audit_fail()`);
  }
});
test("EXT-07 eventos são imutáveis e expostos sem payload", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética eventos" });
  const ev = await pool.query(`SELECT id FROM ext_compliance_events WHERE obligation_id=$1 AND event_type='obligation_created'`, [o.id]);
  assert.equal(ev.rowCount, 1);
  await assert.rejects(pool.query(`UPDATE ext_compliance_events SET payload='{}' WHERE id=$1`, [ev.rows[0].id]), /immutable/);
  await assert.rejects(pool.query(`DELETE FROM ext_compliance_events WHERE id=$1`, [ev.rows[0].id]), /immutable/);
  const list = (await api(`/api/ext/compliance/events?obligation_id=${o.id}`)).body;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].payload, undefined);
  assert.equal(list.items[0].event_type, "obligation_created");
});

// ---------------- renovação / versionamento ----------------
test("EXT-07 renovação cria nova versão vinculada e preserva histórico byte a byte", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética renovação" });
  const today = await dbToday();
  const v1 = await createDocument(o, { __today: today, document_number: "QA-99881234" });
  assert.equal(v1.status, 201);
  const beforeRow = (await pool.query(`SELECT protocol,title,description,issue_date,expiry_date,declared_reference,version_no,status FROM ext_compliance_documents WHERE id=$1`, [v1.body.document.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/documents/${v1.body.document.id}/renew`, { method: "POST", body: { issue_date: today, expiry_date: isoAdd(today, 365), reference_type: "renovacao_declarada", declared_reference: "REF-RENOV-2" } })).status, 400, "justificativa obrigatória");
  const v2 = await api(`/api/ext/compliance/documents/${v1.body.document.id}/renew`, { method: "POST", body: { issue_date: today, expiry_date: isoAdd(today, 365), reference_type: "renovacao_declarada", declared_reference: "REF-RENOV-2", justification: "Renovação anual sintética devidamente formalizada." } });
  assert.equal(v2.status, 201, v2.text);
  assert.equal(v2.body.version_no, 2);
  assert.equal(v2.body.replaced_version, v1.body.document.id);
  const v2row = (await pool.query(`SELECT replacement_of, version_no, status FROM ext_compliance_documents WHERE id=$1`, [v2.body.document.id])).rows[0];
  assert.equal(v2row.replacement_of, v1.body.document.id);
  const afterRow = (await pool.query(`SELECT protocol,title,description,issue_date,expiry_date,declared_reference,version_no,status FROM ext_compliance_documents WHERE id=$1`, [v1.body.document.id])).rows[0];
  assert.deepEqual(afterRow.protocol, beforeRow.protocol);
  assert.deepEqual(afterRow.declared_reference, beforeRow.declared_reference);
  assert.deepEqual(afterRow.issue_date, beforeRow.issue_date);
  assert.deepEqual(afterRow.expiry_date, beforeRow.expiry_date);
  assert.deepEqual(afterRow.version_no, 1);
  const detail = (await api(`/api/ext/compliance/documents/${v2.body.document.id}`)).body;
  assert.equal(detail.document.predecessor.id, v1.body.document.id);
  const list = (await api("/api/ext/compliance/documents")).body;
  assert.ok(!list.items.some(d => d.id === v1.body.document.id), "listagem mostra apenas a versão atual");
  assert.ok(list.items.some(d => d.id === v2.body.document.id));
});
test("EXT-07 renovação só da ponta; cancelada não renova; história é acíclica", opt, async () => {
  const o = await createObligation({ title: "Obrigação sintética ponta" });
  const today = await dbToday();
  const v1 = await createDocument(o, { __today: today });
  const v2 = await (await api(`/api/ext/compliance/documents/${v1.body.document.id}/renew`, { method: "POST", body: { issue_date: today, expiry_date: isoAdd(today, 300), reference_type: "renovacao_declarada", declared_reference: "REF-PONTA-2", justification: "Renovação sintética da primeira versão." } }));
  assert.equal(v2.status, 201);
  const again = await api(`/api/ext/compliance/documents/${v1.body.document.id}/renew`, { method: "POST", body: { issue_date: today, expiry_date: isoAdd(today, 300), reference_type: "renovacao_declarada", declared_reference: "REF-PONTA-3", justification: "Tentativa sintética fora da ponta." } });
  assert.equal(again.status, 409);
  const cancelOb = await createObligation({ title: "Obrigação sintética cancelada" });
  const docC = await insertSqlDoc(cancelOb.id, { status: "cancelada", issue: isoAdd(today, -200), expiry: isoAdd(today, 100) });
  assert.equal((await api(`/api/ext/compliance/documents/${docC.id}/renew`, { method: "POST", body: { issue_date: today, expiry_date: isoAdd(today, 300), reference_type: "renovacao_declarada", declared_reference: "REF-CANC", justification: "Tentativa sintética em cancelada." } })).status, 409);
  assert.ok(v2.body.document.id && /^[0-9a-f-]{36}$/.test(v2.body.document.id), "renovação retorna o novo id");
  // Sobrescrever a linhagem com OUTRO id é mutação de campo imutável
  // (reapontar o predecessor é reescrever o histórico — deve rejeitar).
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET replacement_of=$2 WHERE id=$1`, [v2.body.document.id, docC.id]), /immutable/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET version_no=7 WHERE id=$1`, [v2.body.document.id]), /immutable/);
  await assert.rejects(pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,origin,obligation_id,responsible_identity,is_private,validity_rule,reference_type,declared_reference,issue_date,effective_start_date,expiry_date,created_by_identity,version_no,replacement_of) VALUES($1,'Doc ciclo','Descrição ciclo suficiente ok.','licenca','vigente','ext07_canonica',$2,$3,true,'regra','ref','REF-CICLO',$4,$4,$5,$3,1,$6)`, [`COMP-EXT-${today.replaceAll("-", "")}-CIC1`, o.id, ti.id, today, isoAdd(today, 30), v2.body.document.id]), /tip|increment/i, "só a ponta e version_no+1");
});
test("EXT-07 banco impede sobrescrita destrutiva da validade e do número", opt, async () => {
  const list = await pool.query(`SELECT id FROM ext_compliance_documents WHERE origin='ext07_canonica' LIMIT 1`);
  const id = list.rows[0].id;
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET expiry_date='2099-01-01' WHERE id=$1`, [id]), /immutable/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET declared_reference='REF-ADULTERADA' WHERE id=$1`, [id]), /immutable/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET document_number='999' WHERE id=$1`, [id]), /immutable/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET obligation_id=$2 WHERE id=$1`, [id, randomUUID()]), /immutable/);
});

// ---------------- legado / fronteira pública ----------------
test("EXT-07 legado: leitura minimizada com items, autenticação antes do 410", opt, async () => {
  const read = await api("/api/ext/compliance-documents");
  assert.equal(read.status, 200);
  assert.ok(Array.isArray(read.body.items));
  const raw = JSON.stringify(read.body);
  for (const forbidden of ["storage_key", "file_url", "file_name", "document_number", "declared_reference", "responsible_identity", globalThis.__legacySecret, globalThis.__legacyNumber])
    assert.ok(!raw.includes(forbidden), `legado não deve expor ${forbidden}`);
  assert.equal((await api("/api/ext/compliance-documents", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance-documents", { cookie: cookieRh })).status, 403);
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", origin: "https://attacker.invalid", body: {} })).status, 403, "same-origin antes do 410");
  assert.equal((await api("/api/ext/compliance-documents", { method: "POST", body: {} })).status, 410);
  assert.equal((await api("/api/ext/compliance-documents", { method: "PATCH", body: { id: randomUUID() } })).status, 410);
  for (const p of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents"]) {
    assert.equal((await api(p)).status, 200, p);
    assert.equal((await api(p, { method: "POST", body: {} })).status, 410, p);
  }
});
test("EXT-07 não existe rota pública de compliance", opt, async () => {
  for (const p of ["/api/compliance", "/api/public/compliance-documents", "/compliance"]) {
    const r = await fetch(base + p, { redirect: "manual" });
    assert.equal(r.status, 404, p);
  }
  const pub = await api("/api/ext/compliance/documents/public");
  assert.equal(pub.status, 400, pub.text);
  assert.equal(pub.body.error, "invalid_uuid", "o namespace não tem rota pública: 'public' é só um id malformado");
});

// ---------------- UI ----------------
test("EXT-07 tela /admin/compliance real com fronteira declarada", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`);
  const t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /Compliance corporativo/);
  assert.match(t, /upload, bytes, checksum, malware scan/);
});
test("EXT-07 tela /admin/ti preservada (ExtAdvancedClient não removido)", opt, async () => {
  const r = await fetch(`${base}/admin/ti`);
  assert.equal(r.status, 200);
});

// ---------------- regressão EXT-08..12 ----------------
test("EXT-07 regressão EXT-08 base conhecimento", opt, async () => {
  const g = await api("/api/ext/knowledge-base");
  assert.equal(g.status, 200);
  const w = await api("/api/ext/knowledge-base", { method: "POST", body: { slug: `qa-ext07-${randomUUID().slice(0, 8)}`, title: "Procedimento sintético QA", content: "Conteúdo sintético suficientemente longo para a base de conhecimento compartilhada.", category: "qa-geral" } });
  assert.ok([200, 201].includes(w.status), w.text);
});
test("EXT-07 regressão EXT-09 expansão e cenários", opt, async () => {
  assert.equal((await api("/api/ext/expansion-plans")).status, 200);
  assert.equal((await api("/api/ext/expansion-scenarios")).status, 200);
});
test("EXT-07 regressão EXT-10 continuidade", opt, async () => {
  // EXT-10 (histórico): lista básica do módulo de continuidade. O JOIN com
  // client_accounts exibe apenas colunas existentes (display_name, não "name").
  const o = await createObligation({ title: "Obrigação sintética continuidade" });
  assert.ok(o.id, "fixture da regressão rastreável");
  const g = await api("/api/ext/continuity-plans");
  assert.equal(g.status, 200, g.text);
  assert.ok(Array.isArray(g.body.items), "GET retorna a lista documentada");
});
test("EXT-07 regressão EXT-11 analytics", opt, async () => {
  assert.equal((await api("/api/ext/analytics-experiments")).status, 200);
});
test("EXT-07 regressão EXT-12 tokens e layouts visuais", opt, async () => {
  assert.equal((await api("/api/ext/visual-tokens")).status, 200);
  assert.equal((await api("/api/ext/visual-layouts")).status, 200);
  const w = await api("/api/ext/visual-tokens", { method: "POST", body: { token_key: `qa-ext07-${randomUUID().slice(0, 8)}`, token_value: { cor: "#123456" }, category: "qa-ext07-tokens" } });
  assert.ok([200, 201].includes(w.status), w.text);
});

// ---------------- cluster limpo / semeadura ----------------
test("EXT-07 cluster limpo não teve seed e tudo é rastreável ao QA", opt, async () => {
  const seeded = await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE created_by_identity IS NULL OR created_by_identity NOT IN (SELECT id FROM auth_identities WHERE email LIKE '%@example.invalid')`);
  assert.equal(seeded.rows[0].n, 0);
  const legacyTouched = await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE origin='registro_legado' AND title NOT LIKE 'Documento legado sintético%'`);
  assert.equal(legacyTouched.rows[0].n, 0, "nenhum legado além dos fixtures declarados do próprio teste");
});
