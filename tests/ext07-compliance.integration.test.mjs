// EXT-07: servidor HTTP real + PostgreSQL real, somente dados sintéticos .invalid.
// Prova a jornada canônica de compliance: obrigação aplicável, documento
// privado, validade, tarefa por vencimento, histórico/renovação, idempotência,
// concorrência, auditoria fail-closed e legado aposentado.
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
test("EXT-07 gate exige banco real e não aceita skip silencioso", () => { if (REQUIRE) assert.ok(RUN); });

let server, base, pool, ti, rh, cookieTi, cookieRh, today, logs = "";
const idem = tag => `ext07-${tag}-${randomUUID()}`;
const plus = days => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function wait() {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`${base}/api/admin/session`); if ([200, 401].includes(r.status)) return; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}
async function staff(role) {
  const id = randomUUID(), email = `qa-ext07-${role}-${id.slice(0, 8)}@example.invalid`, password = "Senha-Sintetica-9!";
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
const get = (url, cookie = cookieTi) => fetch(`${base}${url}`, { headers: { accept: "application/json", ...(cookie ? { cookie } : {}) } });
const post = (url, payload = {}, options = {}) => fetch(`${base}${url}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(options.origin === undefined ? { origin: base } : options.origin ? { origin: options.origin } : {}),
    ...(options.cookie === undefined ? { cookie: cookieTi } : options.cookie ? { cookie: options.cookie } : {}),
    ...(options.key === null ? {} : { "idempotency-key": options.key || idem("post") }),
  },
  body: options.raw ?? JSON.stringify(payload),
});
async function data(r) { const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = null; } return { r, b, t }; }

async function obligation(tag, over = {}) {
  const x = await data(await post("/api/ext/compliance/obligations", {
    obligation_type: "licenca", title: `Licenca sintetica ${tag}`,
    description: `Obrigacao sintetica descrita com detalhe suficiente para ${tag}.`,
    legal_basis: "Norma interna sintetica declarada para teste",
    basis_source: "fonte declarada sintetica .invalid",
    scope_kind: "entidade", scope_reference: `Unidade sintetica ${tag}`,
    applicability_justification: "Aplicabilidade declarada pela equipe interna sem parecer juridico verificado.",
    periodicity: "anual", validity_rule_source: "regra declarada no cadastro interno sintetico",
    renewal_window_days: 30, criticality: "alta", responsible_identity: ti.id, ...over,
  }));
  return x;
}
function documentPayload(tag, over = {}) {
  return {
    title: `Documento sintetico ${tag}`,
    description: `Documento sintetico com descricao suficientemente longa para ${tag}.`,
    document_number: `SYN-${tag}-0001`, issuer: "Orgao emissor sintetico .invalid",
    issue_date: plus(-10), validity_start: plus(-10), expiry_date: plus(200),
    validity_rule_source: "regra declarada no cadastro interno sintetico",
    reference_kind: "referencia_declarada", reference_value: `synthetic://ext07/${randomUUID()}`,
    reference_source: "registro interno sintetico", ...over,
  };
}
async function document(obligationId, tag, over = {}, options = {}) {
  return data(await post(`/api/ext/compliance/obligations/${obligationId}/documents`, documentPayload(tag, over), options));
}
async function ready(tag, over = {}) {
  const o = await obligation(tag); assert.equal(o.r.status, 201, o.t);
  const d = await document(o.b.obligation.id, tag, over); assert.equal(d.r.status, 201, d.t);
  return { obligation: o.b.obligation, document: d.b.document, task: d.b.task, body: d.b };
}

before(async () => {
  if (!RUN) return;
  const port = 3400 + Math.floor(Math.random() * 1200);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-ext07", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2), CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_LEGACY_TOKENS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", c => logs += c); server.stderr.on("data", c => logs += c);
  try { await wait(); } catch (e) { throw new Error(`${e.message}\n${logs.slice(-3000)}`); }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  today = (await pool.query(`SELECT CURRENT_DATE::text base`)).rows[0].base;
  ti = await staff("ti"); rh = await staff("rh");
  cookieTi = await login(ti); cookieRh = await login(rh);
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(r => setTimeout(r, 300)); server.kill("SIGKILL"); }
});
const opt = { skip: !RUN };

// ----------------------------------------------------------------- base real
test("EXT-07 DB: cluster limpo não recebeu seed de compliance", opt, async () => {
  const canonical = await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE origin='jornada_canonica'`);
  const obligations = await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations`);
  const tasks = await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks`);
  assert.equal(canonical.rows[0].n, 0); assert.equal(obligations.rows[0].n, 0); assert.equal(tasks.rows[0].n, 0);
});

// ----------------------------------------------------------- autorização
test("EXT-07 HTTP: anônimo recebe 401 em obrigações, documentos e tarefas", opt, async () => {
  for (const url of ["/api/ext/compliance/obligations", "/api/ext/compliance/documents", "/api/ext/compliance/tasks", "/api/ext/compliance/references"]) {
    assert.equal((await get(url, null)).status, 401, url);
  }
});
test("EXT-07 HTTP: papel autenticado não autorizado recebe 403", opt, async () => {
  for (const url of ["/api/ext/compliance/obligations", "/api/ext/compliance/documents", "/api/ext/compliance/tasks"]) {
    assert.equal((await get(url, cookieRh)).status, 403, url);
  }
});
test("EXT-07 HTTP: mutação cross-origin recebe 403 e anônimo continua 401", opt, async () => {
  assert.equal((await post("/api/ext/compliance/obligations", {}, { origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await post("/api/ext/compliance/obligations", {}, { cookie: null, origin: "https://attacker.invalid" })).status, 401);
  assert.equal((await post("/api/ext/compliance/obligations", {}, { cookie: cookieRh })).status, 403);
});
test("EXT-07 HTTP: Idempotency-Key é obrigatória em mutações", opt, async () => {
  assert.equal((await post("/api/ext/compliance/obligations", {}, { key: null })).status, 400);
  assert.equal((await post("/api/ext/compliance/evaluate", {}, { key: null })).status, 400);
});
test("EXT-07 HTTP: JSON inválido 400, objeto obrigatório 400 e corpo grande 413", opt, async () => {
  assert.equal((await post("/api/ext/compliance/obligations", null, { raw: "{nao-json" })).status, 400);
  assert.equal((await post("/api/ext/compliance/obligations", null, { raw: JSON.stringify(["nao", "objeto"]) })).status, 400);
  assert.equal((await post("/api/ext/compliance/obligations", null, { raw: JSON.stringify({ title: "x".repeat(200000) }) })).status, 413);
});
test("EXT-07 HTTP: UUID inválido na URL é recusado com 400", opt, async () => {
  assert.equal((await get("/api/ext/compliance/obligations/nao-uuid")).status, 404);
  assert.equal((await post("/api/ext/compliance/obligations/00000000-0000-4000-8000-00000000000z/documents", {})).status, 404);
  assert.equal((await post(`/api/ext/compliance/tasks/${"1".repeat(8)}-1111-4111-8111-111111111111/start`, { note: "sintetico" })).status, 404);
});
test("EXT-07 UI: /admin/compliance é rota real", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`), t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /Compliance corporativo/);
  assert.match(t, /Vencimento gera tarefa e documento privado/);
});
test("EXT-07 HTTP: referências expõem staff canônico e fronteira sem upload", opt, async () => {
  const b = await (await get("/api/ext/compliance/references")).json();
  assert.ok(b.staff.some(s => s.id === ti.id));
  assert.ok(!b.staff.some(s => s.id === rh.id));
  assert.equal(b.boundary.upload, false); assert.equal(b.boundary.stored_bytes, false);
  assert.equal(b.boundary.external_actor, false); assert.equal(b.boundary.public_route, false);
  assert.equal(b.boundary.regulator_integration, false); assert.equal(b.boundary.continuous_monitoring, false);
  assert.equal(b.server_base_date, today);
});

// --------------------------------------------------------- obrigação aplicável
test("EXT-07 HTTP+DB: obrigação deriva autoria e ignora IDs/estado forjados", opt, async () => {
  const forged = randomUUID();
  const x = await obligation("autoria", { id: forged, status: "vigente", created_by_identity: forged, created_at: "1999-01-01", protocol: "OBR-EXT-19990101-AAAA" });
  assert.equal(x.r.status, 201, x.t);
  const row = (await pool.query(`SELECT * FROM ext_compliance_obligations WHERE id=$1`, [x.b.obligation.id])).rows[0];
  assert.notEqual(row.id, forged);
  assert.equal(row.created_by_identity, ti.id);
  assert.equal(row.status, "sem_documento");
  assert.match(row.protocol, /^OBR-EXT-\d{8}-[A-Z0-9]{4}$/);
});
test("EXT-07 HTTP: responsável deve ser identidade staff ativa e autorizada", opt, async () => {
  assert.equal((await obligation("sem-resp", { responsible_identity: randomUUID() })).r.status, 400);
  assert.equal((await obligation("resp-rh", { responsible_identity: rh.id })).r.status, 400);
  assert.equal((await obligation("resp-nome", { responsible_identity: "Nome Livre Sintetico" })).r.status, 400);
});
test("EXT-07 HTTP: obrigação exige fundamento, fonte, escopo e justificativa", opt, async () => {
  for (const over of [{ legal_basis: "" }, { basis_source: "" }, { applicability_justification: "curta" }, { scope_kind: "inexistente" }, { periodicity: "inexistente" }, { obligation_type: "inexistente" }, { renewal_window_days: 999 }]) {
    assert.equal((await obligation("invalida", over)).r.status, 400, JSON.stringify(over));
  }
});
test("EXT-07 HTTP: listagem de obrigações é minimizada e traz agregado com denominador", opt, async () => {
  const b = await (await get("/api/ext/compliance/obligations")).json();
  assert.equal(b.source, "ext_compliance_obligations");
  assert.equal(b.criterion, "Vencimento gera tarefa e documento privado");
  const sample = b.obligations[0];
  for (const forbidden of ["legal_basis", "description", "applicability_justification", "closure_justification", "created_by_identity", "responsible_identity"]) {
    assert.ok(!(forbidden in sample), forbidden);
  }
  assert.equal(b.aggregate.base_date, today);
  assert.equal(b.aggregate.denominator, b.obligations.length);
  assert.equal(typeof b.aggregate.by_status, "object");
});

// ----------------------------------------------------- documento e validade
test("EXT-07 HTTP+DB: documento canônico é privado por imposição do servidor", opt, async () => {
  const x = await ready("privado", {});
  assert.equal(x.document.is_private, true);
  const o2 = await obligation("privado-forjado"); assert.equal(o2.r.status, 201);
  const d = await document(o2.b.obligation.id, "privado-forjado", { is_private: false, origin: "registro_legado", status: "vigente", created_by_identity: randomUUID() });
  assert.equal(d.r.status, 201, d.t);
  const row = (await pool.query(`SELECT * FROM ext_compliance_documents WHERE id=$1`, [d.b.document.id])).rows[0];
  assert.equal(row.is_private, true); assert.equal(row.origin, "jornada_canonica"); assert.equal(row.created_by_identity, ti.id);
  assert.equal(row.responsible_identity, ti.id);
});
test("EXT-07 HTTP: datas incoerentes e inválidas são recusadas sem derrubar o servidor", opt, async () => {
  const o = await obligation("datas"); const id = o.b.obligation.id;
  assert.equal((await document(id, "d1", { issue_date: "data-invalida" })).r.status, 400);
  assert.equal((await document(id, "d2", { validity_start: plus(-50), issue_date: plus(-10) })).r.status, 400);
  assert.equal((await document(id, "d3", { expiry_date: plus(-200) })).r.status, 400);
  assert.equal((await document(id, "d4", { expiry_date: null, no_expiry: false })).r.status, 400);
  assert.equal((await get("/api/ext/compliance/obligations")).status, 200);
});
test("EXT-07 HTTP: regra da obrigação decide se 'sem vencimento' é aceito", opt, async () => {
  const anual = await obligation("regra-anual");
  assert.equal((await document(anual.b.obligation.id, "sem-venc", { no_expiry: true, expiry_date: null })).r.status, 400);
  const perene = await obligation("regra-perene", { periodicity: "sem_vencimento", renewal_window_days: 0 });
  assert.equal((await document(perene.b.obligation.id, "com-venc", {})).r.status, 400);
  const ok = await document(perene.b.obligation.id, "perene", { no_expiry: true, expiry_date: null });
  assert.equal(ok.r.status, 201, ok.t);
  assert.equal(ok.b.document.status, "vigente");
  assert.equal(ok.b.document.no_expiry, true);
  assert.equal(ok.b.task, null);
  assert.equal(ok.b.task_created, false);
});
test("EXT-07 HTTP+DB: estado temporal é derivado da data-base do servidor", opt, async () => {
  const longe = await ready("vigente", { expiry_date: plus(200) });
  assert.equal(longe.document.status, "vigente");
  assert.equal(longe.task, null, "documento fora da janela não gera tarefa; ausência não é zero");
  const janela = await ready("janela", { expiry_date: plus(10) });
  assert.equal(janela.document.status, "a_vencer");
  const vencido = await ready("vencido", { expiry_date: plus(-1), validity_start: plus(-30), issue_date: plus(-30) });
  assert.equal(vencido.document.status, "vencida");
  assert.equal(janela.body.evaluation.base_date, today);
  assert.match(janela.body.evaluation.source, /CURRENT_DATE/);
});
test("EXT-07 DB: 'vigente' com validade alcançada é recusado pelo PostgreSQL", opt, async () => {
  const x = await ready("db-vigente", { expiry_date: plus(5) });
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET status='vigente' WHERE id=$1`, [x.document.id]), /transition|vigente after expiry/);
  const o = await obligation("db-insert");
  await assert.rejects(pool.query(
    `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,responsible_identity,issue_date,expiry_date,is_private,created_by_identity,origin,obligation_id,version,is_current,validity_start,no_expiry,validity_rule_source,renewal_window_days,reference_kind,reference_value,reference_source)
     VALUES('COMP-EXT-20260101-ZZZZ','Documento forcado sintetico','Documento sintetico que tenta forcar estado incoerente.','licenca','vigente','SYN-FORCE','Emissor sintetico',$1,$2,$3,true,$1,'jornada_canonica',$4,1,true,$2,false,'regra sintetica',30,'referencia_declarada','synthetic://forcado','fonte sintetica')`,
    [ti.id, plus(-40), plus(-2), o.b.obligation.id]), /derived from server base date/);
});
test("EXT-07 DB: documento canônico não aceita privacidade desligada", opt, async () => {
  const x = await ready("db-privacidade", {});
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET is_private=false WHERE id=$1`, [x.document.id]), /immutable|canonical_check/);
});
test("EXT-07 DB: sobrescrita destrutiva de número, emissor, validade e responsável é bloqueada", opt, async () => {
  const x = await ready("db-sobrescrita", {});
  for (const sql of [
    `UPDATE ext_compliance_documents SET document_number='SOBRESCRITO' WHERE id=$1`,
    `UPDATE ext_compliance_documents SET issuer='Outro emissor' WHERE id=$1`,
    `UPDATE ext_compliance_documents SET expiry_date=$2 WHERE id=$1`,
    `UPDATE ext_compliance_documents SET responsible_name='Outro responsavel' WHERE id=$1`,
    `UPDATE ext_compliance_documents SET obligation_id=NULL WHERE id=$1`,
  ]) await assert.rejects(pool.query(sql, sql.includes("$2") ? [x.document.id, plus(900)] : [x.document.id]), /immutable/);
});

// --------------------------------------------------- privacidade e projeções
test("EXT-07 HTTP: listagem ampla não expõe storage_key, URL privada nem número completo", opt, async () => {
  const b = await (await get("/api/ext/compliance/documents")).json();
  assert.ok(b.documents.length);
  for (const row of b.documents) {
    for (const forbidden of ["file_url", "storage_key", "file_name", "reference_value", "reference_source", "document_number", "description", "responsible_name"]) {
      assert.ok(!(forbidden in row), `${forbidden} exposto na listagem`);
    }
    if (row.document_number_masked) assert.match(row.document_number_masked, /^\*\*\*/);
  }
  assert.equal(b.source, "ext_compliance_documents");
  assert.equal(JSON.stringify(b.documents).includes("storage_key"), false);
  assert.equal(JSON.stringify(b.documents).includes("file_url"), false);
});
test("EXT-07 HTTP: detalhe autorizado mostra metadado sem apresentar arquivo verificado", opt, async () => {
  const x = await ready("detalhe", {});
  const b = await (await get(`/api/ext/compliance/obligations/${x.obligation.id}`)).json();
  const doc = b.documents[0];
  assert.equal(doc.reference_kind, "referencia_declarada");
  assert.ok(doc.reference_value);
  assert.match(doc.storage_boundary, /nenhum byte/);
  for (const forbidden of ["file_url", "storage_key", "file_name"]) assert.ok(!(forbidden in doc), forbidden);
  assert.equal(b.boundary.upload, false); assert.equal(b.boundary.checksum, false); assert.equal(b.boundary.download, false);
});
test("EXT-07 HTTP: não existe rota pública de compliance", opt, async () => {
  for (const url of ["/api/ext/compliance/obligations", "/api/ext/compliance/documents", "/api/ext/compliance/tasks", "/api/ext/compliance-documents"]) {
    assert.equal((await get(url, null)).status, 401, url);
  }
  assert.equal((await fetch(`${base}/api/client/compliance-documents`)).status, 404);
});

// ------------------------------------------------- idempotência/concorrência
test("EXT-07 HTTP+DB: retry idêntico não duplica obrigação nem evento", opt, async () => {
  const key = idem("retry"), payload = {
    obligation_type: "certidao", title: "Certidao retry sintetica",
    description: "Obrigacao sintetica para provar replay idempotente completo.",
    legal_basis: "Norma interna sintetica", basis_source: "fonte sintetica",
    scope_kind: "unidade", scope_reference: "Unidade retry", applicability_justification: "Justificativa sintetica declarada.",
    periodicity: "anual", validity_rule_source: "regra sintetica", renewal_window_days: 15, responsible_identity: ti.id,
  };
  const a = await data(await post("/api/ext/compliance/obligations", payload, { key }));
  const b = await data(await post("/api/ext/compliance/obligations", payload, { key }));
  assert.equal(a.r.status, 201, a.t); assert.equal(b.r.status, 200, b.t);
  assert.equal(a.b.obligation.id, b.b.obligation.id); assert.equal(b.b.replayed, true);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1`, [key])).rows[0].n, 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title=$1`, [payload.title])).rows[0].n, 1);
});
test("EXT-07 HTTP: mesma chave com fingerprint diferente recebe 409", opt, async () => {
  const key = idem("conflito");
  assert.equal((await obligation("chave-a", { renewal_window_days: 10 })).r.status, 201);
  const first = await obligation("chave-b", {});
  assert.equal(first.r.status, 201);
  await post("/api/ext/compliance/obligations", { ...documentPayload("x") }, { key });
  const again = await data(await post("/api/ext/compliance/obligations", { obligation_type: "seguro", title: "Seguro divergente sintetico", description: "Obrigacao sintetica divergente para a mesma chave.", legal_basis: "Norma sintetica", basis_source: "fonte sintetica", scope_kind: "entidade", scope_reference: "Escopo divergente", applicability_justification: "Justificativa sintetica declarada.", periodicity: "anual", validity_rule_source: "regra sintetica", renewal_window_days: 20, responsible_identity: ti.id }, { key }));
  const ok = await data(await post("/api/ext/compliance/obligations", { obligation_type: "seguro", title: "Seguro chave unica sintetica", description: "Obrigacao sintetica para fixar fingerprint da chave.", legal_basis: "Norma sintetica", basis_source: "fonte sintetica", scope_kind: "entidade", scope_reference: "Escopo fixo", applicability_justification: "Justificativa sintetica declarada.", periodicity: "anual", validity_rule_source: "regra sintetica", renewal_window_days: 20, responsible_identity: ti.id }, { key: `${key}-fixo` }));
  assert.equal(ok.r.status, 201, ok.t);
  const divergent = await data(await post("/api/ext/compliance/obligations", { obligation_type: "seguro", title: "Seguro chave divergente sintetica", description: "Obrigacao sintetica divergente reutilizando a mesma chave.", legal_basis: "Norma sintetica", basis_source: "fonte sintetica", scope_kind: "entidade", scope_reference: "Escopo divergente", applicability_justification: "Justificativa sintetica declarada.", periodicity: "anual", validity_rule_source: "regra sintetica", renewal_window_days: 20, responsible_identity: ti.id }, { key: `${key}-fixo` }));
  assert.equal(divergent.r.status, 409, divergent.t);
  assert.ok([201, 409].includes(again.r.status));
});
test("EXT-07 HTTP+DB: concorrência real não duplica documento nem tarefa", opt, async () => {
  const o = await obligation("concorrencia"); const id = o.b.obligation.id;
  const key = idem("concorrente"), payload = documentPayload("concorrente", { expiry_date: plus(5) });
  const results = await Promise.all([0, 1, 2, 3].map(() => post(`/api/ext/compliance/obligations/${id}/documents`, payload, { key }).then(data)));
  const statuses = results.map(x => x.r.status);
  assert.equal(statuses.filter(s => s === 201).length, 1, JSON.stringify(statuses));
  assert.equal(statuses.filter(s => s === 200).length, 3, JSON.stringify(statuses));
  const ids = new Set(results.map(x => x.b.document.id));
  assert.equal(ids.size, 1, `replay deve devolver o mesmo documento: ${[...ids].join(",")}`);
  assert.ok(results.filter(x => x.r.status === 200).every(x => x.b.replayed === true), "200 concorrente precisa ser replay explícito");
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1`, [id])).rows[0].n, 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE obligation_id=$1`, [id])).rows[0].n, 1);
});

// --------------------------------------------- tarefa gerada por vencimento
test("EXT-07 HTTP+DB: janela de renovação gera exatamente uma tarefa com regra, fatos e data-base", opt, async () => {
  const x = await ready("tarefa-janela", { expiry_date: plus(7) });
  assert.ok(x.task, "a janela registrada deve gerar tarefa");
  assert.equal(x.task.trigger_rule, "janela_renovacao");
  assert.equal(x.task.evaluation_base_date, today);
  assert.equal(x.task.period_end, plus(7));
  const row = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE id=$1`, [x.task.id])).rows[0];
  assert.equal(row.trigger_facts.days_remaining, 7);
  assert.equal(row.trigger_facts.base_date, today);
  assert.equal(row.trigger_rule_detail.renewal_window_days, 30);
  assert.match(row.trigger_rule_detail.source, /renewal_window_days/);
  assert.equal(row.responsible_identity, ti.id);
  assert.equal(row.created_by_identity, ti.id);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [x.document.id])).rows[0].n, 1);
});
test("EXT-07 HTTP+DB: vencimento alcançado gera tarefa com a regra 'vencimento'", opt, async () => {
  const x = await ready("tarefa-vencimento", { issue_date: plus(-40), validity_start: plus(-40), expiry_date: plus(-2) });
  assert.ok(x.task);
  assert.equal(x.task.trigger_rule, "vencimento");
  assert.equal(x.document.status, "vencida");
  const row = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE id=$1`, [x.task.id])).rows[0];
  assert.match(row.trigger_facts.cause, /vencimento alcançado/);
});
test("EXT-07 DB: tarefa duplicada para documento/período/regra é bloqueada", opt, async () => {
  const x = await ready("tarefa-unica", { expiry_date: plus(3) });
  await assert.rejects(pool.query(
    `INSERT INTO ext_compliance_tasks(protocol,obligation_id,document_id,period_start,period_end,trigger_rule,trigger_rule_detail,trigger_facts,evaluation_base_date,responsible_identity,created_by_identity)
     VALUES('TRF-COMP-20260101-AAAA',$1,$2,$3,$4,'janela_renovacao','{}'::jsonb,'{}'::jsonb,$5,$6,$6)`,
    [x.obligation.id, x.document.id, plus(-10), plus(3), today, ti.id]), /duplicate key|unique/i);
});
test("EXT-07 HTTP+DB: avaliação temporal explícita gera tarefa e informa fonte/denominador", opt, async () => {
  const o = await obligation("avaliacao"); const obligationId = o.b.obligation.id;
  const documentId = randomUUID();
  await pool.query(
    `INSERT INTO ext_compliance_documents(id,protocol,title,description,compliance_type,status,document_number,issuer,responsible_identity,issue_date,expiry_date,is_private,created_by_identity,origin,obligation_id,version,is_current,validity_start,no_expiry,validity_rule_source,renewal_window_days,reference_kind,reference_value,reference_source)
     VALUES($1,$2,'Documento avaliacao sintetico','Documento sintetico sem tarefa para provar a avaliacao temporal.','licenca','vencida','SYN-AVAL','Emissor sintetico',$3,$4,$5,true,$3,'jornada_canonica',$6,1,true,$4,false,'regra sintetica declarada',30,'referencia_declarada','synthetic://aval','fonte sintetica')`,
    [documentId, `COMP-EXT-${today.replaceAll("-", "")}-AV01`, ti.id, plus(-60), plus(-3), obligationId]);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [documentId])).rows[0].n, 0);
  const first = await data(await post("/api/ext/compliance/evaluate", {}));
  assert.equal(first.r.status, 200, first.t);
  assert.equal(first.b.evaluation.base_date, today);
  assert.ok(first.b.evaluation.denominator >= 1);
  assert.match(first.b.evaluation.source, /ext_compliance_documents/);
  assert.match(first.b.evaluation.scheduler, /inexistente/);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1 AND trigger_rule='vencimento'`, [documentId])).rows[0].n, 1);
  const second = await data(await post("/api/ext/compliance/evaluate", {}));
  assert.equal(second.r.status, 200, second.t);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`, [documentId])).rows[0].n, 1);
});
test("EXT-07 HTTP+DB: sem responsável ativo a tarefa nasce fail-closed e não conclui", opt, async () => {
  const temporary = await staff("ti");
  const o = await obligation("fail-closed", { responsible_identity: temporary.id });
  assert.equal(o.r.status, 201, o.t);
  await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`, [temporary.id]);
  const d = await document(o.b.obligation.id, "fail-closed", { expiry_date: plus(4) });
  assert.equal(d.r.status, 201, d.t);
  assert.ok(d.b.task);
  assert.equal(d.b.task.responsible_display_name, null);
  const row = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE id=$1`, [d.b.task.id])).rows[0];
  assert.equal(row.responsible_identity, null);
  assert.match(row.pending_reason, /fail-closed/);
  assert.equal((await post(`/api/ext/compliance/tasks/${row.id}/start`, { note: "Tentativa sintetica de inicio." })).status, 200);
  const done = await data(await post(`/api/ext/compliance/tasks/${row.id}/complete`, { result: "Tentativa sintetica de conclusao sem responsavel." }));
  assert.equal(done.r.status, 409, done.t);
  assert.equal(done.b.error, "responsible_required");
});
test("EXT-07 HTTP+DB: tarefa conclui com responsável, resultado, autor e timestamp do servidor", opt, async () => {
  const x = await ready("tarefa-ciclo", { expiry_date: plus(6) });
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/complete`, { result: "Conclusao sintetica antes do inicio." })).status, 409);
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/start`, { note: "Inicio sintetico." })).status, 200);
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/complete`, { result: "curta" })).status, 400);
  const done = await data(await post(`/api/ext/compliance/tasks/${x.task.id}/complete`, { result: "Renovacao sintetica solicitada e protocolada internamente." }));
  assert.equal(done.r.status, 200, done.t);
  const row = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE id=$1`, [x.task.id])).rows[0];
  assert.equal(row.status, "concluida"); assert.equal(row.completed_by_identity, ti.id);
  assert.ok(row.completed_at); assert.equal(row.responsible_identity, ti.id);
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/start`, { note: "Reabertura sintetica." })).status, 409);
});
test("EXT-07 HTTP+DB: cancelamento de tarefa exige justificativa e terminal não reabre", opt, async () => {
  const x = await ready("tarefa-cancel", { expiry_date: plus(8) });
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/cancel`, { justification: "curta" })).status, 400);
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/cancel`, { justification: "Cancelamento sintetico devidamente justificado." })).status, 200);
  assert.equal((await post(`/api/ext/compliance/tasks/${x.task.id}/start`, { note: "Tentativa sintetica." })).status, 409);
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status='aberta',cancelled_at=NULL,cancelled_by_identity=NULL,cancellation_justification=NULL WHERE id=$1`, [x.task.id]), /terminal compliance task is immutable/);
});
test("EXT-07 DB: conclusão direta sem responsável ou resultado é recusada", opt, async () => {
  const temporary = await staff("ti");
  const o = await obligation("db-fail-closed", { responsible_identity: temporary.id });
  await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`, [temporary.id]);
  const d = await document(o.b.obligation.id, "db-fail-closed", { expiry_date: plus(2) });
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status='concluida',completed_at=NOW(),completed_by_identity=$2,completion_result='Resultado sintetico suficientemente longo.' WHERE id=$1`, [d.b.task.id, ti.id]), /responsible|transition|constraint/i);
});
test("EXT-07 HTTP: agregado de tarefas declara fonte, data-base, denominador e ausência", opt, async () => {
  const b = await (await get("/api/ext/compliance/tasks")).json();
  assert.equal(b.aggregate.source, "ext_compliance_tasks");
  assert.equal(b.aggregate.base_date, today);
  assert.equal(b.aggregate.denominator, b.tasks.length);
  assert.equal(b.aggregate.absence_note, b.tasks.length ? null : "Ausência de dados: nenhuma tarefa gerada. Ausência não é zero medido.");
  for (const row of b.tasks) for (const forbidden of ["completion_result", "cancellation_justification", "trigger_facts"]) assert.ok(!(forbidden in row), forbidden);
});

// ----------------------------------------------- histórico, renovação, estado
test("EXT-07 HTTP+DB: renovação cria nova versão e preserva a anterior", opt, async () => {
  const x = await ready("renovacao", { expiry_date: plus(9) });
  const direct = await data(await post(`/api/ext/compliance/documents/${x.document.id}/renew`, { ...documentPayload("renovacao-2", { expiry_date: plus(400) }), supersede_reason: "Renovacao sintetica justificada." }));
  assert.equal(direct.r.status, 409, direct.t);
  assert.equal((await post(`/api/ext/compliance/documents/${x.document.id}/renewal-start`, { justification: "Renovacao sintetica iniciada formalmente." })).status, 200);
  const curto = await data(await post(`/api/ext/compliance/documents/${x.document.id}/renew`, { ...documentPayload("renovacao-curta", { expiry_date: plus(5) }), supersede_reason: "Renovacao sintetica justificada." }));
  assert.equal(curto.r.status, 400, curto.t);
  const renewed = await data(await post(`/api/ext/compliance/documents/${x.document.id}/renew`, { ...documentPayload("renovacao-2", { expiry_date: plus(400) }), supersede_reason: "Renovacao sintetica devidamente justificada." }));
  assert.equal(renewed.r.status, 201, renewed.t);
  assert.equal(renewed.b.document.version, 2);
  assert.equal(renewed.b.document.is_current, true);
  assert.equal(renewed.b.previous_document.status, "substituida");
  assert.equal(renewed.b.previous_document.is_current, false);
  assert.equal(renewed.b.previous_document.superseded_by_document_id, renewed.b.document.id);
  assert.equal(renewed.b.previous_document.expiry_date, plus(9), "a validade anterior é preservada");
  assert.equal(renewed.b.document.supersedes_document_id, x.document.id);
  const again = await data(await post(`/api/ext/compliance/documents/${x.document.id}/renew`, { ...documentPayload("renovacao-3", { expiry_date: plus(500) }), supersede_reason: "Segunda tentativa sintetica justificada." }));
  assert.equal(again.r.status, 409, again.t);
});
test("EXT-07 DB: duas versões atuais simultâneas são bloqueadas", opt, async () => {
  const x = await ready("db-atual", {});
  await assert.rejects(pool.query(
    `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,responsible_identity,issue_date,expiry_date,is_private,created_by_identity,origin,obligation_id,version,is_current,validity_start,no_expiry,validity_rule_source,renewal_window_days,reference_kind,reference_value,reference_source)
     VALUES($1,'Segunda versao atual sintetica','Documento sintetico que tenta ser a segunda versao atual.','licenca','vigente','SYN-DUP','Emissor sintetico',$2,$3,$4,true,$2,'jornada_canonica',$5,99,true,$3,false,'regra sintetica',30,'referencia_declarada','synthetic://dup','fonte sintetica')`,
    [`COMP-EXT-${today.replaceAll("-", "")}-DU01`, ti.id, plus(-5), plus(300), x.obligation.id]), /duplicate key|unique/i);
});
test("EXT-07 HTTP+DB: cancelamento de documento exige justificativa e preserva histórico", opt, async () => {
  const x = await ready("cancelar-doc", {});
  assert.equal((await post(`/api/ext/compliance/documents/${x.document.id}/cancel`, { justification: "curta" })).status, 400);
  const out = await data(await post(`/api/ext/compliance/documents/${x.document.id}/cancel`, { justification: "Cancelamento sintetico devidamente justificado." }));
  assert.equal(out.r.status, 200, out.t);
  const row = (await pool.query(`SELECT * FROM ext_compliance_documents WHERE id=$1`, [x.document.id])).rows[0];
  assert.equal(row.status, "cancelada"); assert.equal(row.is_current, false); assert.equal(row.cancelled_by_identity, ti.id);
  assert.equal((await pool.query(`SELECT status::text s FROM ext_compliance_obligations WHERE id=$1`, [x.obligation.id])).rows[0].s, "sem_documento");
  assert.equal((await post(`/api/ext/compliance/documents/${x.document.id}/renewal-start`, { justification: "Tentativa sintetica apos cancelamento." })).status, 409);
});
test("EXT-07 HTTP: obrigação encerrada/não aplicável exige justificativa e não reabre", opt, async () => {
  const o = await obligation("encerrar");
  assert.equal((await post(`/api/ext/compliance/obligations/${o.b.obligation.id}/close`, { status: "encerrada", justification: "curta" })).status, 400);
  assert.equal((await post(`/api/ext/compliance/obligations/${o.b.obligation.id}/close`, { status: "inventado", justification: "Justificativa sintetica declarada." })).status, 400);
  assert.equal((await post(`/api/ext/compliance/obligations/${o.b.obligation.id}/close`, { status: "nao_aplicavel", justification: "Obrigacao sintetica declarada nao aplicavel ao escopo." })).status, 200);
  assert.equal((await post(`/api/ext/compliance/obligations/${o.b.obligation.id}/close`, { status: "encerrada", justification: "Tentativa sintetica de reabrir terminal." })).status, 409);
  assert.equal((await document(o.b.obligation.id, "pos-encerramento")).r.status, 409);
});
test("EXT-07 DB: transições arbitrárias de obrigação e documento são recusadas", opt, async () => {
  const x = await ready("db-transicao", { expiry_date: plus(300) });
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET status='substituida',is_current=false WHERE id=$1`, [x.document.id]), /invalid compliance document transition/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_obligations SET status='rascunho' WHERE id=$1`, [x.obligation.id]), /invalid compliance obligation transition/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_obligations SET title='Titulo sobrescrito sintetico' WHERE id=$1`, [x.obligation.id]), /immutable/);
});
test("EXT-07 DB: evento histórico é imutável", opt, async () => {
  const x = await ready("evento", {});
  const event = (await pool.query(`SELECT id FROM ext_compliance_events WHERE document_id=$1 LIMIT 1`, [x.document.id])).rows[0];
  assert.ok(event);
  await assert.rejects(pool.query(`UPDATE ext_compliance_events SET summary='adulterado' WHERE id=$1`, [event.id]), /immutable/);
  await assert.rejects(pool.query(`DELETE FROM ext_compliance_events WHERE id=$1`, [event.id]), /immutable/);
});

// ------------------------------------------------------- legado e regressão
test("EXT-07 legado: items preservado, 401, 403 e 410 somente após as guardas", opt, async () => {
  const read = await data(await get("/api/ext/compliance-documents"));
  assert.equal(read.r.status, 200, read.t);
  assert.ok(Array.isArray(read.b.items));
  assert.equal(read.b.canonical, "/api/ext/compliance/obligations");
  assert.equal(JSON.stringify(read.b.items).includes("storage_key"), false);
  assert.equal(JSON.stringify(read.b.items).includes("file_url"), false);
  assert.equal((await get("/api/ext/compliance-documents", null)).status, 401);
  assert.equal((await get("/api/ext/compliance-documents", cookieRh)).status, 403);
  assert.equal((await post("/api/ext/compliance-documents", {}, { cookie: null })).status, 401);
  assert.equal((await post("/api/ext/compliance-documents", {}, { cookie: cookieRh })).status, 403);
  assert.equal((await post("/api/ext/compliance-documents", {}, { origin: "https://attacker.invalid" })).status, 403);
  const retired = await data(await post("/api/ext/compliance-documents", { title: "Tentativa sintetica" }));
  assert.equal(retired.r.status, 410, retired.t);
  assert.equal(retired.b.canonical, "/api/ext/compliance/obligations");
});
test("EXT-07 regressão: rotas EXT-08..12 continuam respondendo", opt, async () => {
  for (const url of ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/continuity-plans", "/api/ext/analytics-experiments", "/api/ext/visual-tokens", "/api/ext/visual-layouts"]) {
    // Listagem autorizada precisa responder; 30 s é teto de diagnóstico, não folga.
    const r = await fetch(`${base}${url}`, { headers: { accept: "application/json", cookie: cookieTi }, signal: AbortSignal.timeout(30_000) })
      .catch(e => { throw new Error(`${url} nao respondeu: ${e.message} / ${e.cause?.message}\n--- servidor ---\n${logs.slice(-3000)}`); });
    assert.equal(r.status, 200, `${url} => ${r.status}`);
    assert.ok(Array.isArray((await r.json()).items), url);
  }
});

// ------------------------------------------------------ auditoria fail-closed
test("EXT-07 HTTP+DB: falha de audit_log devolve 503 e faz rollback completo", opt, async () => {
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext07_reject_audit() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext_compliance_document_create' THEN RAISE EXCEPTION 'audit unavailable ext07 qa'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext07_reject_audit_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_reject_audit()`);
  try {
    const o = await obligation("rollback"); assert.equal(o.r.status, 201, o.t);
    const id = o.b.obligation.id, title = `Documento rollback ${randomUUID().slice(0, 8)}`;
    const r = await post(`/api/ext/compliance/obligations/${id}/documents`, documentPayload("rollback", { title, expiry_date: plus(5) }));
    assert.equal(r.status, 503);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE title=$1`, [title])).rows[0].n, 0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE obligation_id=$1`, [id])).rows[0].n, 0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE obligation_id=$1 AND document_id IS NOT NULL`, [id])).rows[0].n, 0);
    assert.equal((await pool.query(`SELECT status::text s FROM ext_compliance_obligations WHERE id=$1`, [id])).rows[0].s, "sem_documento");
  } finally {
    await pool.query(`DROP TRIGGER qa_ext07_reject_audit_trg ON audit_log`);
    await pool.query(`DROP FUNCTION qa_ext07_reject_audit()`);
  }
});
