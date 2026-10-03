// EXT-07: PostgreSQL real + servidor HTTP real; somente fixtures sintéticas .invalid.
// Prova por execução: 401/403, same-origin, idempotência, concorrência, validade,
// privacidade, versionamento, tarefa única por vencimento e rollback de auditoria.
import test, {before, after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes, randomUUID} from "node:crypto";
import path from "node:path";
import pg from "pg";
import {hashPassword} from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
test("EXT-07 gate exige PostgreSQL real", () => {if (REQUIRE) assert.ok(RUN);});

let server, base, pool, ti, rh, cookieTi, cookieRh;
let serverLogs = "";
const idem = t => `ext07-${t}-${randomUUID()}`;
const iso = d => {const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10);};

async function wait() {
  for (let i = 0; i < 200; i++) {
    try {if ([200, 401].includes((await fetch(`${base}/api/admin/session`)).status)) return;} catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw Error("server_did_not_start");
}
async function staff(role) {
  const id = randomUUID(), email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`, password = "Senha-Sintetica-9!";
  await pool.query("INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')", [id, email, `QA EXT07 ${role}`]);
  await pool.query("INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)", [id, await hashPassword(password)]);
  await pool.query("INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')", [id, role]);
  return {id, email, password};
}
async function login(s) {
  const r = await fetch(`${base}/api/admin/session`, {method: "POST", headers: {"content-type": "application/json", origin: base}, body: JSON.stringify({email: s.email, password: s.password})});
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().find(x => x.startsWith("seg_admin_session=")).split(";")[0];
}
async function api(url, {method = "GET", cookie = cookieTi, body, key, origin = base, raw} = {}) {
  const headers = {accept: "application/json", origin, ...(cookie ? {cookie} : {}), ...(method !== "GET" ? {"idempotency-key": key === null ? "" : key || idem("request")} : {})};
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  let r;
  try {
    r = await fetch(base + url, {method, headers, body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw});
  } catch (error) {
    throw Error(`request_failed ${method} ${url}: ${error?.message || error}\nSERVER_LOG_TAIL:\n${serverLogs.slice(-4000)}`);
  }
  const text = await r.text();
  let data; try {data = JSON.parse(text);} catch {data = {raw: text};}
  return {status: r.status, body: data, text: text.slice(0, 600)};
}

const obligationBody = (over = {}) => ({
  obligation_type: "licenca", title: "Licenca sintetica EXT07",
  description: "Obrigacao sintetica criada apenas para a prova automatizada.",
  legal_basis: "Politica interna sintetica QA versao 1", basis_kind: "declarada_interna",
  scope_kind: "entidade", scope_label: "Entidade sintetica QA",
  applicability_justification: "Aplicavel por decisao interna sintetica registrada no QA.",
  periodicity: "anual", renewal_window_days: 30, criticality: "alta",
  responsible_identity_id: ti?.id, ...over,
});
const documentBody = (over = {}) => ({
  compliance_type: "licenca", title: "Documento sintetico EXT07",
  description: "Referencia documental sintetica declarada para a prova.",
  document_number: "QA-SINTETICO-0001", issuer: "Emissor sintetico QA",
  issue_date: iso(-400), valid_from: iso(-365), has_expiry: true, expiry_date: iso(365),
  reference_kind: "referencia_declarada", reference_declared: "Pasta sintetica QA 001",
  reference_source: "Registro interno sintetico", reference_note: null, ...over,
});
async function makeObligation(over = {}, options = {}) {
  const x = await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody(over), ...options});
  assert.equal(x.status, 201, x.text);
  return x.body.obligation;
}
async function makeDocument(obligationId, over = {}, options = {}) {
  return api(`/api/ext/compliance/obligations/${obligationId}/documents`, {method: "POST", body: documentBody(over), ...options});
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 10});
  const port = 3500 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext07", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1"},
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", x => {serverLogs += x;});
  server.stderr.on("data", x => {serverLogs += x;});
  server.on("exit", (code, signal) => {serverLogs += `\n[servidor encerrou code=${code} signal=${signal}]\n`;});
  try {await wait();} catch (e) {throw Error(`${e.message}\n${serverLogs.slice(-3000)}`);}
  ti = await staff("ti"); rh = await staff("rh");
  cookieTi = await login(ti); cookieRh = await login(rh);
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {server.kill("SIGTERM"); await new Promise(r => setTimeout(r, 300)); server.kill("SIGKILL");}
});
const opt = {skip: !RUN};

// ---------------------------------------------------------------- autorização e entrada
test("EXT-07 anônimo recebe 401", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {cookie: null})).status, 401));
test("EXT-07 papel staff não autorizado recebe 403", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {cookie: cookieRh})).status, 403));
test("EXT-07 detalhe e tarefas também distinguem 401 de 403", opt, async () => {
  const o = await makeObligation();
  assert.equal((await api(`/api/ext/compliance/obligations/${o.id}`, {cookie: null})).status, 401);
  assert.equal((await api(`/api/ext/compliance/obligations/${o.id}`, {cookie: cookieRh})).status, 403);
  assert.equal((await api("/api/ext/compliance/evaluate", {method: "POST", body: {}, cookie: null})).status, 401);
  assert.equal((await api("/api/ext/compliance/evaluate", {method: "POST", body: {}, cookie: cookieRh})).status, 403);
});
test("EXT-07 mutação exige same-origin", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody(), origin: "https://attacker.invalid"})).status, 403));
test("EXT-07 chave de idempotência é obrigatória", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody(), key: null})).status, 400));
test("EXT-07 JSON inválido recebe 400", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", raw: "{"})).status, 400));
test("EXT-07 corpo que não é objeto JSON recebe 400", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", raw: "[1,2,3]"})).status, 400));
test("EXT-07 corpo grande recebe 413", opt, async () => assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", raw: JSON.stringify({x: "x".repeat(40000)})})).status, 413));
test("EXT-07 UUID inválido recebe 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations/nao-e-uuid")).status, 404);
  assert.equal((await api("/api/ext/compliance/evaluate", {method: "POST", body: {obligation_id: "nao-e-uuid"}})).status, 400);
});

// ---------------------------------------------------------------- obrigação e responsável canônico
test("EXT-07 responsável deve ser identidade staff ativa e autorizada", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody({responsible_identity_id: randomUUID()})})).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody({responsible_identity_id: rh.id})})).status, 400);
});
test("EXT-07 obrigação exige fundamento, escopo e justificativa de aplicabilidade", opt, async () => {
  for (const over of [{legal_basis: "x"}, {scope_label: ""}, {applicability_justification: "curta"}, {basis_kind: "inventado"}, {scope_kind: "inventado"}, {periodicity: "inventada"}, {renewal_window_days: 9999}, {obligation_type: "inventado"}]) {
    assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody(over)})).status, 400, JSON.stringify(over));
  }
});
test("EXT-07 autoria e estado forjados no corpo são ignorados", opt, async () => {
  const o = await makeObligation({created_by_identity: randomUUID(), status: "encerrada", responsible_name: "Nome Forjado", protocol: "OBR-EXT-19990101-ZZZZ"});
  assert.equal(o.created_by_identity, ti.id);
  assert.equal(o.status, "ativa");
  assert.equal(o.responsible_identity_id, ti.id);
  assert.match(o.protocol, /^OBR-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.notEqual(o.protocol, "OBR-EXT-19990101-ZZZZ");
});
test("EXT-07 obrigação sem documento é estado distinto", opt, async () => {
  const o = await makeObligation();
  const list = (await api("/api/ext/compliance/obligations")).body.obligations;
  assert.equal(list.find(x => x.id === o.id).temporal_state, "sem_documento");
});

// ---------------------------------------------------------------- validade e regra temporal
test("EXT-07 documento exige obrigação canônica existente", opt, async () => {
  assert.equal((await makeDocument(randomUUID())).status, 404);
});
test("EXT-07 datas incoerentes são recusadas", opt, async () => {
  const o = await makeObligation();
  for (const over of [
    {valid_from: iso(10), expiry_date: iso(5)},
    {issue_date: iso(10), valid_from: iso(5)},
    {valid_from: "nao-e-data"},
    {expiry_date: "nao-e-data"},
    {has_expiry: true, expiry_date: null},
    {has_expiry: false, expiry_date: iso(30)},
    {reference_kind: "inventado"},
    {reference_declared: "x"},
  ]) assert.equal((await makeDocument(o.id, over)).status, 400, JSON.stringify(over));
});
test("EXT-07 não é possível registrar vigente já vencido: o servidor deriva o estado", opt, async () => {
  const o = await makeObligation();
  const r = await makeDocument(o.id, {issue_date: iso(-800), valid_from: iso(-730), expiry_date: iso(-10), status: "vigente"});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.temporal_state, "vencida");
  const row = (await pool.query("SELECT status::text AS s, state_base_date::text AS b FROM ext_compliance_documents WHERE id=$1", [r.body.document.id])).rows[0];
  assert.equal(row.s, "vencida");
  assert.equal(row.b, (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d);
});
test("EXT-07 banco recusa vigente com vencimento anterior à data-base", opt, async () => {
  const o = await makeObligation();
  const r = await makeDocument(o.id, {valid_from: iso(-30), expiry_date: iso(-1)});
  assert.equal(r.status, 201, r.text);
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET status='vigente' WHERE id=$1", [r.body.document.id]), /temporal_state|immutable|constraint/i);
});
test("EXT-07 ausência de vencimento é declarada e não gera tarefa", opt, async () => {
  const o = await makeObligation();
  const r = await makeDocument(o.id, {has_expiry: false, expiry_date: null});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.expiry_absence, "sem_vencimento_declarado");
  assert.equal(r.body.task, null);
  assert.equal(r.body.task_created, false);
});

// ---------------------------------------------------------------- tarefa por vencimento
test("EXT-07 vencimento gera tarefa com regra, fatos e data-base do servidor", opt, async () => {
  const o = await makeObligation({renewal_window_days: 30});
  const r = await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(10)});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.temporal_state, "a_vencer");
  assert.equal(r.body.task_created, true);
  const t = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [r.body.document.id])).rows;
  assert.equal(t.length, 1);
  assert.equal(t[0].responsible_identity_id, ti.id);
  assert.equal(t[0].trigger_rule.renewal_window_days, 30);
  assert.equal(t[0].trigger_rule.source, "ext_compliance_obligations.renewal_window_days");
  assert.equal(t[0].trigger_facts.observed_state, "a_vencer");
  assert.equal(new Date(t[0].base_date).toISOString().slice(0, 10), (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d);
  assert.equal(t[0].created_by_identity, ti.id);
});
test("EXT-07 documento ainda longe do vencimento não gera tarefa", opt, async () => {
  const o = await makeObligation({renewal_window_days: 10});
  const r = await makeDocument(o.id, {valid_from: iso(-10), expiry_date: iso(300)});
  assert.equal(r.body.temporal_state, "vigente");
  assert.equal(r.body.task_created, false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [r.body.document.id])).rows[0].n, 0);
});
test("EXT-07 avaliação temporal repetida não duplica a tarefa do mesmo vencimento", opt, async () => {
  const o = await makeObligation({renewal_window_days: 30});
  const r = await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(5)});
  assert.equal(r.body.task_created, true);
  for (let i = 0; i < 3; i++) {
    const e = await api("/api/ext/compliance/evaluate", {method: "POST", body: {obligation_id: o.id}});
    assert.equal(e.status, 200, e.text);
    assert.equal(e.body.tasks_created, 0);
    assert.equal(e.body.base_date, (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d);
  }
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [r.body.document.id])).rows[0].n, 1);
});
test("EXT-07 concorrência real não produz duas tarefas para o mesmo vencimento", opt, async () => {
  const o = await makeObligation({renewal_window_days: 60});
  const r = await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(20)});
  assert.equal(r.status, 201, r.text);
  const races = await Promise.all([1, 2, 3, 4].map(() => api("/api/ext/compliance/evaluate", {method: "POST", body: {obligation_id: o.id}})));
  assert.deepEqual(races.map(x => x.status).sort(), [200, 200, 200, 200]);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [r.body.document.id])).rows[0].n, 1);
});
test("EXT-07 banco recusa segunda tarefa para documento/período/regra iguais", opt, async () => {
  const t = (await pool.query("SELECT * FROM ext_compliance_tasks ORDER BY created_at DESC LIMIT 1")).rows[0];
  await assert.rejects(pool.query(
    `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period_start,validity_period_end,trigger_rule,trigger_rule_key,trigger_facts,base_date,responsible_identity_id,created_by_identity)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [t.obligation_id, t.document_id, t.validity_period_start, t.validity_period_end, t.trigger_rule, t.trigger_rule_key, t.trigger_facts, t.base_date, t.responsible_identity_id, t.created_by_identity]),
  /duplicate key|unique/i);
});
test("EXT-07 sem responsável ativo a tarefa nasce fail-closed e não conclui", opt, async () => {
  const temp = await staff("ti");
  const o = await makeObligation({responsible_identity_id: temp.id, renewal_window_days: 30});
  await pool.query("UPDATE auth_identities SET status='suspended' WHERE id=$1", [temp.id]);
  // Documento não pode ser registrado com responsável inativo; o registro é fail-closed.
  assert.equal((await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(5)})).status, 409);
  // Reativando, registra; depois a inativação deixa a tarefa seguinte pendente.
  await pool.query("UPDATE auth_identities SET status='active' WHERE id=$1", [temp.id]);
  const r = await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(5)});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.task.responsible_identity_id, temp.id);
  const o2 = await makeObligation({responsible_identity_id: temp.id, renewal_window_days: 30});
  const r2 = await makeDocument(o2.id, {valid_from: iso(-300), expiry_date: iso(3)});
  assert.equal(r2.status, 201, r2.text);
  await pool.query("UPDATE auth_identities SET status='suspended' WHERE id=$1", [temp.id]);
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [r2.body.document.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`, {method: "POST", body: {result: "Resultado sintetico da conclusao."}})).status, 409);
  await pool.query("UPDATE auth_identities SET status='active' WHERE id=$1", [temp.id]);
});
test("EXT-07 banco recusa tarefa sem responsável e sem pendência declarada", opt, async () => {
  const t = (await pool.query("SELECT * FROM ext_compliance_tasks ORDER BY created_at DESC LIMIT 1")).rows[0];
  await assert.rejects(pool.query(
    `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period_start,validity_period_end,trigger_rule,trigger_rule_key,trigger_facts,base_date,responsible_identity_id,pending_reason,created_by_identity)
     VALUES($1,$2,$3,$4,$5,'regra-sintetica-qa',$6,$7,NULL,NULL,$8)`,
    [t.obligation_id, t.document_id, t.validity_period_start, t.validity_period_end, t.trigger_rule, t.trigger_facts, t.base_date, t.created_by_identity]),
  /pending_shape|constraint/i);
});

// ---------------------------------------------------------------- estados da tarefa
test("EXT-07 tarefa inicia, conclui com responsável e resultado", opt, async () => {
  const o = await makeObligation({renewal_window_days: 40});
  const r = await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(7)});
  const id = r.body.task.id;
  assert.equal((await api(`/api/ext/compliance/tasks/${id}/start`, {method: "POST", body: {note: "Inicio sintetico registrado."}})).status, 200);
  assert.equal((await api(`/api/ext/compliance/tasks/${id}/complete`, {method: "POST", body: {result: "curto"}})).status, 400);
  assert.equal((await api(`/api/ext/compliance/tasks/${id}/complete`, {method: "POST", body: {result: "Renovacao sintetica concluida com evidencia declarada."}})).status, 200);
  const t = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE id=$1", [id])).rows[0];
  assert.equal(t.status, "concluida");
  assert.equal(t.completed_by_identity, ti.id);
  assert.ok(t.completed_at);
});
test("EXT-07 terminal da tarefa não reabre silenciosamente", opt, async () => {
  const t = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE status='concluida' ORDER BY completed_at DESC LIMIT 1")).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${t.id}/start`, {method: "POST", body: {note: "Tentativa de reabertura sintetica."}})).status, 409);
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1", [t.id]), /terminal|transition|immutable/i);
});
test("EXT-07 cancelamento da tarefa exige justificativa e fica terminal", opt, async () => {
  const o = await makeObligation({renewal_window_days: 40});
  const r = await makeDocument(o.id, {valid_from: iso(-300), expiry_date: iso(6)});
  const id = r.body.task.id;
  assert.equal((await api(`/api/ext/compliance/tasks/${id}/cancel`, {method: "POST", body: {justification: "curta"}})).status, 400);
  assert.equal((await api(`/api/ext/compliance/tasks/${id}/cancel`, {method: "POST", body: {justification: "Cancelamento sintetico devidamente justificado."}})).status, 200);
  assert.equal((await api(`/api/ext/compliance/tasks/${id}/complete`, {method: "POST", body: {result: "Tentativa terminal com resultado sintetico."}})).status, 409);
});
test("EXT-07 responsável, vínculo e fatos da tarefa são imutáveis no banco", opt, async () => {
  const t = (await pool.query("SELECT id FROM ext_compliance_tasks ORDER BY created_at DESC LIMIT 1")).rows[0];
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET responsible_identity_id=$2 WHERE id=$1", [t.id, rh.id]), /immutable|terminal/i);
  await assert.rejects(pool.query("UPDATE ext_compliance_tasks SET trigger_facts='{}'::jsonb WHERE id=$1", [t.id]), /immutable|terminal/i);
});

// ---------------------------------------------------------------- histórico, renovação e versionamento
test("EXT-07 segundo documento sem renovação explícita é recusado", opt, async () => {
  const o = await makeObligation();
  assert.equal((await makeDocument(o.id)).status, 201);
  const second = await makeDocument(o.id);
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "current_document_exists_use_renewal");
});
test("EXT-07 renovação cria versão nova, preserva a anterior e encerra formalmente", opt, async () => {
  const o = await makeObligation();
  const first = await makeDocument(o.id, {document_number: "QA-V1", valid_from: iso(-300), expiry_date: iso(60)});
  assert.equal(first.status, 201, first.text);
  const renewed = await makeDocument(o.id, {
    document_number: "QA-V2", valid_from: iso(0), expiry_date: iso(400),
    supersedes_document_id: first.body.document.id,
    renewal_justification: "Renovacao sintetica justificada para a prova.",
  });
  assert.equal(renewed.status, 201, renewed.text);
  assert.equal(renewed.body.document.version, 2);
  assert.equal(renewed.body.superseded_document_id, first.body.document.id);
  const rows = (await pool.query("SELECT id,version,status::text AS status,is_current,document_number,superseded_by_document_id FROM ext_compliance_documents WHERE obligation_id=$1 ORDER BY version", [o.id])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "substituida");
  assert.equal(rows[0].is_current, false);
  assert.equal(rows[0].document_number, "QA-V1", "o número anterior é preservado, não sobrescrito");
  assert.equal(rows[0].superseded_by_document_id, rows[1].id);
  assert.equal(rows[1].is_current, true);
});
test("EXT-07 renovação exige justificativa e referência ao documento atual", opt, async () => {
  const o = await makeObligation();
  const first = await makeDocument(o.id);
  assert.equal((await makeDocument(o.id, {supersedes_document_id: first.body.document.id})).status, 400);
  assert.equal((await makeDocument(o.id, {supersedes_document_id: randomUUID(), renewal_justification: "Justificativa sintetica suficiente."})).status, 409);
});
test("EXT-07 banco impede duas versões atuais e reativação da versão substituída", opt, async () => {
  const o = await makeObligation();
  const first = await makeDocument(o.id);
  await makeDocument(o.id, {supersedes_document_id: first.body.document.id, renewal_justification: "Renovacao sintetica justificada."});
  await assert.rejects(pool.query("UPDATE ext_compliance_documents SET is_current=true WHERE id=$1", [first.body.document.id]), /become current again|immutable|terminal|unique|duplicate/i);
});
test("EXT-07 banco recusa sobrescrita destrutiva de número, emissor, validade e responsável", opt, async () => {
  const o = await makeObligation();
  const r = await makeDocument(o.id);
  const id = r.body.document.id;
  for (const sql of [
    "UPDATE ext_compliance_documents SET document_number='FORJADO' WHERE id=$1",
    "UPDATE ext_compliance_documents SET issuer='FORJADO' WHERE id=$1",
    "UPDATE ext_compliance_documents SET expiry_date=CURRENT_DATE+1000 WHERE id=$1",
    "UPDATE ext_compliance_documents SET responsible_identity_id=NULL WHERE id=$1",
    "UPDATE ext_compliance_documents SET is_private=false WHERE id=$1",
    "UPDATE ext_compliance_documents SET reference_declared='FORJADO' WHERE id=$1",
    "UPDATE ext_compliance_documents SET obligation_id=NULL WHERE id=$1",
  ]) await assert.rejects(pool.query(sql, [id]), /immutable/i, sql);
});
test("EXT-07 obrigação canônica é imutável na configuração e no terminal", opt, async () => {
  const o = await makeObligation();
  await assert.rejects(pool.query("UPDATE ext_compliance_obligations SET renewal_window_days=1 WHERE id=$1", [o.id]), /immutable/i);
  await assert.rejects(pool.query("UPDATE ext_compliance_obligations SET legal_basis='FORJADO' WHERE id=$1", [o.id]), /immutable/i);
  assert.equal((await api(`/api/ext/compliance/obligations/${o.id}/close`, {method: "POST", body: {status: "encerrada", justification: "curta"}})).status, 400);
  assert.equal((await api(`/api/ext/compliance/obligations/${o.id}/close`, {method: "POST", body: {status: "encerrada", justification: "Encerramento sintetico devidamente justificado."}})).status, 200);
  assert.equal((await api(`/api/ext/compliance/obligations/${o.id}/close`, {method: "POST", body: {status: "nao_aplicavel", justification: "Tentativa sintetica de reabertura formal."}})).status, 409);
  await assert.rejects(pool.query("UPDATE ext_compliance_obligations SET status='ativa' WHERE id=$1", [o.id]), /reopen|immutable/i);
});

// ---------------------------------------------------------------- idempotência e transação
test("EXT-07 retry idêntico não duplica obrigação", opt, async () => {
  const key = idem("retry"), body = obligationBody();
  const a = await api("/api/ext/compliance/obligations", {method: "POST", body, key});
  const b = await api("/api/ext/compliance/obligations", {method: "POST", body, key});
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.body.replayed, true);
  assert.equal(b.body.obligation.id, a.body.obligation.id);
});
test("EXT-07 reuso divergente da mesma chave recebe 409", opt, async () => {
  const key = idem("conflict");
  assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody(), key})).status, 201);
  assert.equal((await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody({title: "Titulo sintetico divergente"}), key})).status, 409);
});
test("EXT-07 retry de documento e concorrência de criação não duplicam versão", opt, async () => {
  const o = await makeObligation();
  const key = idem("doc"), body = documentBody();
  const races = await Promise.all([1, 2, 3].map(() => api(`/api/ext/compliance/obligations/${o.id}/documents`, {method: "POST", body, key})));
  assert.ok(races.some(x => x.status === 201));
  assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1", [o.id])).rows[0].n, 1);
});
test("EXT-07 evento imutável é gravado por mutação", opt, async () => {
  const o = await makeObligation();
  const e = (await pool.query("SELECT * FROM ext_compliance_events WHERE obligation_id=$1", [o.id])).rows;
  assert.equal(e.length, 1);
  assert.equal(e[0].event_type, "obrigacao_registrada");
  assert.equal(e[0].actor_identity_id, ti.id);
  await assert.rejects(pool.query("DELETE FROM ext_compliance_events WHERE id=$1", [e[0].id]), /immutable/i);
  await assert.rejects(pool.query("UPDATE ext_compliance_events SET payload='{}'::jsonb WHERE id=$1", [e[0].id]), /immutable/i);
});
test("EXT-07 falha de audit_log causa 503 e rollback completo", opt, async () => {
  await pool.query("CREATE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext_compliance_obligation_create' THEN RAISE EXCEPTION 'audit fail'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql");
  await pool.query("CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()");
  const key = idem("rollback");
  const before = (await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations")).rows[0].n;
  try {
    const r = await api("/api/ext/compliance/obligations", {method: "POST", body: obligationBody({title: "Rollback sintetico auditavel"}), key});
    assert.equal(r.status, 503, r.text);
    assert.equal(r.body.error, "audit_unavailable");
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [key])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations")).rows[0].n, before);
  } finally {
    await pool.query("DROP TRIGGER qa_ext07_audit_fail_trg ON audit_log");
    await pool.query("DROP FUNCTION qa_ext07_audit_fail()");
  }
});

// ---------------------------------------------------------------- privacidade e projeções
test("EXT-07 documento canônico é privado por imposição do servidor", opt, async () => {
  const o = await makeObligation();
  const r = await makeDocument(o.id, {is_private: false});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.document.is_private, true);
  assert.equal((await pool.query("SELECT is_private FROM ext_compliance_documents WHERE id=$1", [r.body.document.id])).rows[0].is_private, true);
});
test("EXT-07 listagem ampla não expõe conteúdo privado", opt, async () => {
  const b = (await api("/api/ext/compliance/obligations")).body;
  const raw = JSON.stringify(b.obligations);
  for (const forbidden of ["storage_key", "file_url", "file_name", "document_number", "reference_declared", "reference_note", "QA-SINTETICO", "trigger_facts", "audit", "completion_result"]) {
    assert.doesNotMatch(raw, new RegExp(forbidden, "i"), forbidden);
  }
  assert.equal(b.projection.minimized, true);
  for (const row of b.obligations) assert.deepEqual(Object.keys(row).sort(), [...b.projection.fields].sort());
});
test("EXT-07 detalhe autorizado mostra metadados e declara a fronteira de armazenamento", opt, async () => {
  const o = await makeObligation();
  const r = await makeDocument(o.id, {document_number: "QA-DETALHE-9"});
  assert.equal(r.status, 201, r.text);
  const d = (await api(`/api/ext/compliance/obligations/${o.id}`)).body;
  assert.equal(d.documents[0].document_number, "QA-DETALHE-9");
  assert.equal(d.storage_boundary.kind, "referencia_declarada");
  assert.match(d.storage_boundary.note, /Não há upload, bytes recebidos, checksum/);
  assert.match(d.storage_boundary.legacy_metadata_warning, /não provam arquivo existente/);
  assert.match(d.applicability_boundary, /não há integração regulatória/i);
  // Metadado não é apresentado como arquivo verificado.
  const raw = JSON.stringify(d);
  for (const invented of ["checksum", "sha256", "malware_scan", "download_url", "bytes_stored", "verified_storage", "file_url", "storage_key"]) {
    assert.doesNotMatch(raw, new RegExp(`"[a-z_]*${invented}[a-z_]*"\\s*:`, "i"), invented);
  }
});
test("EXT-07 não existe rota pública nem de cliente para compliance", opt, async () => {
  for (const url of ["/api/public/compliance", "/api/client/compliance", "/api/cliente/compliance"]) {
    assert.equal((await api(url, {cookie: null})).status, 404, url);
  }
});
test("EXT-07 tela /admin/compliance é real", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`);
  const t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /Compliance corporativo/i);
  assert.match(t, /Vencimento gera tarefa e documento privado/);
});

// ---------------------------------------------------------------- agregados e ausência
test("EXT-07 agregado declara fonte, data-base e denominador", opt, async () => {
  const b = (await api("/api/ext/compliance/obligations")).body;
  assert.equal(b.aggregate.source, "ext_compliance_obligations + ext_compliance_documents");
  assert.equal(typeof b.aggregate.denominator, "number");
  assert.equal(b.aggregate.base_date, (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d);
  assert.ok("absence" in b.aggregate);
  assert.equal(b.aggregate.tasks.source, "ext_compliance_tasks");
  assert.ok("absence" in b.aggregate.tasks);
  assert.equal(b.criterion, "Vencimento gera tarefa e documento privado");
});
test("EXT-07 ausência é distinta de zero em escopo recém-criado", opt, async () => {
  // Obrigação nova sem documento: denominador de documentos avaliáveis é 0, com ausência explícita.
  const o = await makeObligation();
  const e = await api("/api/ext/compliance/evaluate", {method: "POST", body: {obligation_id: o.id}});
  assert.equal(e.status, 200, e.text);
  assert.equal(e.body.denominator, 0);
  assert.equal(e.body.absence, "sem_documentos_avaliaveis");
  assert.match(e.body.scheduler, /Não há scheduler canônico/);
});

// ---------------------------------------------------------------- legado e regressão
test("EXT-07 legado preserva items e aposenta escrita após as guardas", opt, async () => {
  const url = "/api/ext/compliance-documents";
  const r = await api(url);
  assert.equal(r.status, 200, r.text);
  assert.ok(Array.isArray(r.body.items));
  assert.equal(r.body.canonical, "/api/ext/compliance/obligations");
  assert.equal((await api(url, {cookie: null})).status, 401);
  assert.equal((await api(url, {cookie: cookieRh})).status, 403);
  // 410 só DEPOIS de autenticação, papel e same-origin.
  assert.equal((await api(url, {method: "POST", body: {}, cookie: null})).status, 401);
  assert.equal((await api(url, {method: "POST", body: {}, cookie: cookieRh})).status, 403);
  assert.equal((await api(url, {method: "POST", body: {}, origin: "https://attacker.invalid"})).status, 403);
  assert.equal((await api(url, {method: "POST", body: {}})).status, 410);
  assert.equal((await api(url, {method: "PATCH", body: {}})).status, 410);
});
test("EXT-07 aliases hr legados seguem na borda pré-existente de RH", opt, async () => {
  // authorizeLegacyHrRequest (pré-existente) intercepta /api/(admin|crm)/hr/*:
  // anônimo 401 e staff sem permissão de RH 403. A rota continua registrada (não é 404).
  for (const url of ["/api/admin/hr/ext-compliance-documents", "/api/crm/hr/ext-compliance-documents", "/api/hr/ext-compliance-documents"]) {
    assert.equal((await api(url, {cookie: null})).status, 401, url);
    const r = await api(url);
    assert.equal(r.status, 403, url);
    assert.equal(r.body.error, "employee_permission_required", url);
  }
});
test("EXT-07 leitura legada não expõe URL, storage_key nem número documental", opt, async () => {
  const raw = JSON.stringify((await api("/api/ext/compliance-documents")).body.items);
  for (const forbidden of ["storage_key", "file_url", "file_name", "document_number", "reference_declared"]) {
    assert.doesNotMatch(raw, new RegExp(forbidden, "i"), forbidden);
  }
});
test("EXT-07 não há regressão nas rotas EXT-08..12 saudáveis", opt, async () => {
  for (const url of ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/analytics-experiments", "/api/ext/visual-tokens", "/api/ext/visual-layouts"]) {
    const r = await api(url);
    assert.equal(r.status, 200, `${url} ${r.text}`);
    assert.ok(Array.isArray(r.body.items), url);
  }
  for (const url of ["/api/ext/knowledge-base", "/api/ext/visual-tokens"]) {
    assert.equal((await api(url, {cookie: null})).status, 401, url);
  }
});
test("EXT-07 handler EXT-10 continuidade segue intocado (defeito pré-existente fora de escopo)", opt, async () => {
  // /api/ext/continuity-plans usa `ca.name`, coluna inexistente em client_accounts:
  // a rejeição não tratada derruba o processo HTTP. É defeito PRÉ-EXISTENTE da EXT-10,
  // não regressão da EXT-07, e por isso não é exercitado por HTTP aqui.
  const {readFile} = await import("node:fs/promises");
  const source = await readFile(new URL("../src/server/ext-advanced-api.mjs", import.meta.url), "utf8");
  assert.match(source, /handleContinuityPlans/);
  assert.match(source, /ca\.name as client_name FROM ext_continuity_plans/);
  const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='client_accounts'")).rows.map(r => r.column_name);
  assert.ok(!columns.includes("name"), "client_accounts não tem coluna name: o defeito EXT-10 é real e pré-existente");
  assert.ok(columns.includes("display_name"));
});
test("EXT-07 cluster limpo não teve seed da migração 153", opt, async () => {
  // Toda linha canônica existente foi criada por esta suíte, com autoria staff real.
  const n = (await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations WHERE created_by_identity IS NULL")).rows[0].n;
  assert.equal(n, 0);
  const legacy = (await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE origin='registro_legado'")).rows[0].n;
  assert.equal(legacy, 0, "o cluster limpo não tem linhas legadas: isso prova ausência de seed, não ausência de dados operacionais reais");
});
