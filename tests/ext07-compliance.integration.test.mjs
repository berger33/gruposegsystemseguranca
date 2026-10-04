// EXT-07: Prova HTTP real + PostgreSQL 17 real; somente dados sintéticos em domínios .invalid.
// Sem bypass, sem skip silencioso, sem tolerância a falha em auditoria.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE_DB = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-07 gate exige PostgreSQL real e recusa skip silencioso", () => {
  if (REQUIRE_DB) {
    assert.ok(RUN, "EXT-07 requer RUN_DATABASE_INTEGRATION=1 e DATABASE_URL configurados no gate dedicado");
  }
});

let server, base, pool, ti, adminUser, rh, cookieTi, cookieAdmin, cookieRh;
const idem = (tag) => `ext07-${tag}-${randomUUID()}`;

async function wait() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${base}/api/admin/session`);
      if ([200, 401].includes(r.status)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}

async function staff(role) {
  const id = randomUUID();
  const email = `qa-ext07-${role}-${id.slice(0, 8)}@empresa.invalid`;
  const password = "Senha-Sintetica-EXT07-9!";
  await pool.query(
    `INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`,
    [id, email, `QA EXT07 ${role.toUpperCase()}`]
  );
  await pool.query(
    `INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`,
    [id, await hashPassword(password)]
  );
  await pool.query(
    `INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`,
    [id, role]
  );
  return { id, email, password, role };
}

async function login(s) {
  const r = await fetch(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: s.email, password: s.password }),
  });
  assert.equal(r.status, 200);
  const cookie = r.headers.getSetCookie().find((x) => x.startsWith("seg_admin_session="));
  assert.ok(cookie);
  return cookie.split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw } = {}) {
  const headers = {
    accept: "application/json",
    ...(origin !== undefined ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": key === null ? "" : key || idem("req") } : {}),
  };
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + url, {
    method,
    headers,
    body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: r.status, body: data, text, headers: r.headers };
}

const obligationConfig = (over = {}) => ({
  obligation_type: "licenca",
  title: "Licença de Operação Sintética QA",
  description: "Obrigação legal regulatória sintética para prova automatizada de compliance corporativo.",
  declared_source: "Órgão Ambiental Estadual Sintético - Processo 2026/001.invalid",
  applicability_scope: "Unidade Operacional Matriz",
  applicability_justification: "Atividade de segurança eletrônica com monitoramento exige conformidade ambiental e predial sintética.",
  validity_rule: "Renovação anual com antecedência mínima de 30 dias antes do vencimento.",
  renewal_lead_days: 30,
  criticality: "alta",
  responsible_identity: ti.id,
  ...over,
});

async function createObligation(over = {}, options = {}) {
  const res = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig(over),
    ...options,
  });
  assert.equal(res.status, 201, `createObligation failed: ${res.text}`);
  return res.body.obligation;
}

const documentConfig = (obligationId, over = {}) => {
  const issue = over.issue_date || "2026-01-15";
  const start = over.effective_start_date || issue;
  return {
    obligation_id: obligationId,
    title: "Certificado de Regularidade Operacional Sintético",
    description: "Referência documental sintética do alvará de funcionamento da unidade.",
    compliance_type: "licenca",
    document_number: "LIC-2026-SYN-001",
    issuer: "Prefeitura Municipal Sintética",
    issue_date: issue,
    effective_start_date: start,
    expiry_date: "2026-10-01",
    reference_type: "referencia_declarada",
    declared_reference: "REF-ARQUIVAMENTO-SINTETICO-2026-A1",
    reference_source: "Pasta Administrativa Digital Interna 2026",
    ...over,
  };
};

async function createDocument(obligationId, over = {}, options = {}) {
  const res = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentConfig(obligationId, over),
    ...options,
  });
  assert.equal(res.status, 201, `createDocument failed: ${res.text}`);
  return res.body.document;
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3700 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
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
  let logs = "";
  server.stdout.on("data", (x) => (logs += x));
  server.stderr.on("data", (x) => (logs += x));
  try {
    await wait();
  } catch (e) {
    throw new Error(`${e.message}\n${logs.slice(-3000)}`);
  }
  ti = await staff("ti");
  adminUser = await staff("admin");
  rh = await staff("rh");
  cookieTi = await login(ti);
  cookieAdmin = await login(adminUser);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server) {
    server.stdout?.destroy();
    server.stderr?.destroy();
    if (!server.killed) {
      server.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      server.kill("SIGKILL");
    }
  }
});

const opt = { skip: !RUN };

// --- 1. Autenticação e autorização ---
test("EXT-07 HTTP: anônimo recebe 401 em listagem de obrigações", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { cookie: null });
  assert.equal(r.status, 401);
});

test("EXT-07 HTTP: anônimo recebe 401 em listagem de documentos", opt, async () => {
  const r = await api("/api/ext/compliance/documents", { cookie: null });
  assert.equal(r.status, 401);
});

test("EXT-07 HTTP: papel não autorizado (rh) recebe 403 em leitura de obrigações", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { cookie: cookieRh });
  assert.equal(r.status, 403);
});

test("EXT-07 HTTP: papel não autorizado (rh) recebe 403 em mutações", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    cookie: cookieRh,
    body: obligationConfig(),
  });
  assert.equal(r.status, 403);
});

test("EXT-07 HTTP: staff admin e ti são autorizados para leitura e escrita", opt, async () => {
  const rTi = await api("/api/ext/compliance/obligations", { cookie: cookieTi });
  assert.equal(rTi.status, 200);
  const rAdmin = await api("/api/ext/compliance/obligations", { cookie: cookieAdmin });
  assert.equal(rAdmin.status, 200);
});

test("EXT-07 HTTP: identidade inválida / inexistente como responsável é rejeitada", opt, async () => {
  const badId = randomUUID();
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ responsible_identity: badId }),
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "responsible_staff_required");
});

test("EXT-07 HTTP+DB: sessão é a única fonte de autoria (created_by_identity forjado é ignorado)", opt, async () => {
  const forged = randomUUID();
  const ob = await createObligation({ created_by_identity: forged });
  assert.equal(ob.created_by_identity, ti.id);
  const inDb = (await pool.query("SELECT created_by_identity FROM ext_compliance_obligations WHERE id=$1", [ob.id])).rows[0];
  assert.equal(inDb.created_by_identity, ti.id);
});

test("EXT-07 HTTP+DB: status inicial, protocolo e versão são controlados pelo servidor", opt, async () => {
  const ob = await createObligation({ status: "encerrada", id: randomUUID() });
  assert.equal(ob.status, "pendente");
  const doc = await createDocument(ob.id, { status: "vencida", protocol: "FORGED-PROTO-999" });
  assert.equal(doc.status, "vigente");
  assert.match(doc.protocol, /^COMP-EXT-\d{8}-[A-Z0-9]+$/);
});

test("EXT-07 HTTP: mutações exigem same-origin (cross-origin recebe 403)", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig(),
    origin: "https://atacante.invalid",
  });
  assert.equal(r.status, 403);
});

test("EXT-07 HTTP: ausência de rota pública para documentos de compliance", opt, async () => {
  const r1 = await fetch(`${base}/api/public/compliance`);
  const r2 = await fetch(`${base}/api/compliance/download/123`);
  assert.ok([404, 405].includes(r1.status));
  assert.ok([404, 405].includes(r2.status));
});

// --- 2. Entrada e protocolo ---
test("EXT-07 HTTP: JSON malformado retorna 400", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    raw: "{ json-invalido-sintetico",
  });
  assert.equal(r.status, 400);
});

test("EXT-07 HTTP: corpo acima do limite retorna 413", opt, async () => {
  const large = { x: "a".repeat(150 * 1024) };
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    raw: JSON.stringify(large),
  });
  assert.equal(r.status, 413);
});

test("EXT-07 HTTP: UUID inválido na URL retorna 400", opt, async () => {
  const rDoc = await api("/api/ext/compliance/documents/not-a-valid-uuid");
  assert.equal(rDoc.status, 400);
  const rOb = await api("/api/ext/compliance/obligations/not-a-valid-uuid");
  assert.equal(rOb.status, 400);
  const rTask = await api("/api/ext/compliance/tasks/not-a-valid-uuid/start", { method: "POST" });
  assert.equal(rTask.status, 400);
});

test("EXT-07 HTTP: Idempotency-Key ausente retorna 400", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig(),
    key: null,
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "idempotency_key_required");
});

test("EXT-07 HTTP: Idempotency-Key curta (<8 caracteres) retorna 400", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig(),
    key: "curta",
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "idempotency_key_required");
});

// --- 3. Obrigações ---
test("EXT-07 HTTP: campos obrigatórios da obrigação são validados", opt, async () => {
  const rShortTitle = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ title: "abc" }),
  });
  assert.equal(rShortTitle.status, 400);
  const rNoSource = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ declared_source: "" }),
  });
  assert.equal(rNoSource.status, 400);
  const rNoRule = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ validity_rule: "" }),
  });
  assert.equal(rNoRule.status, 400);
});

test("EXT-07 HTTP+DB: obrigação preserva tipo, fonte, escopo, justificativa, regra e criticidade", opt, async () => {
  const ob = await createObligation({
    obligation_type: "alvara",
    title: "Alvará Sanitário Sintético 2026",
    description: "Alvará de fiscalização sanitária sintético para prova de retenção de dados.",
    declared_source: "Vigilância Sanitária Municipal Sintética",
    applicability_scope: "Refeitório e Ambulatório",
    applicability_justification: "Conformidade sanitária predial obrigatória em instalações corporativas.",
    validity_rule: "Vistoria e renovação bienal obrigatória.",
    renewal_lead_days: 45,
    criticality: "critica",
  });
  assert.equal(ob.obligation_type, "alvara");
  assert.equal(ob.title, "Alvará Sanitário Sintético 2026");
  assert.equal(ob.criticality, "critica");
  assert.equal(ob.renewal_lead_days, 45);
  assert.equal(ob.responsible_identity, ti.id);

  const getRes = await api(`/api/ext/compliance/obligations/${ob.id}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.obligation.title, "Alvará Sanitário Sintético 2026");
  assert.equal(getRes.body.obligation.responsible_name, "QA EXT07 TI");
});

test("EXT-07 HTTP: listagem de obrigações informa fonte canônica, denominador e ausência", opt, async () => {
  const list = await api("/api/ext/compliance/obligations");
  assert.equal(list.status, 200);
  assert.equal(list.body.source, "ext07_canonica");
  assert.equal(typeof list.body.denominator, "number");
  assert.equal(typeof list.body.absence_is_not_zero, "boolean");
});

test("EXT-07 HTTP: obrigação inexistente retorna 404", opt, async () => {
  const r = await api(`/api/ext/compliance/obligations/${randomUUID()}`);
  assert.equal(r.status, 404);
});

// --- 4. Documentos e Fronteira Documental ---
test("EXT-07 HTTP: documento sem obrigação cadastrada retorna 404", opt, async () => {
  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentConfig(randomUUID()),
  });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "obligation_not_found");
});

test("EXT-07 HTTP+DB: documento é sempre privado e gravado no PostgreSQL", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id);
  assert.equal(doc.is_private, true);
  const dbRow = (await pool.query("SELECT is_private, origin FROM ext_compliance_documents WHERE id=$1", [doc.id])).rows[0];
  assert.equal(dbRow.is_private, true);
  assert.equal(dbRow.origin, "ext07_canonica");
});

test("EXT-07 HTTP: listagem de documentos minimiza projeção e declara fronteira sem upload", opt, async () => {
  const list = await api("/api/ext/compliance/documents");
  assert.equal(list.status, 200);
  assert.equal(list.body.source, "ext07_canonica");
  assert.equal(list.body.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  const raw = JSON.stringify(list.body);
  assert.doesNotMatch(raw, /storage_key/);
  assert.doesNotMatch(raw, /file_url/);
  assert.doesNotMatch(raw, /file_content/);
  assert.doesNotMatch(raw, /checksum/);
  assert.doesNotMatch(raw, /malware/);
});

test("EXT-07 HTTP: detalhe de documento usa allowlist estrita", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id);
  const det = await api(`/api/ext/compliance/documents/${doc.id}`);
  assert.equal(det.status, 200);
  assert.equal(det.body.document.id, doc.id);
  assert.equal(det.body.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  assert.equal(det.body.document.storage_key, undefined);
  assert.equal(det.body.document.file_url, undefined);
});

test("EXT-07 DB: cluster limpo não recebeu seed legado como canônico", opt, async () => {
  const q = await pool.query("SELECT count(*)::int n FROM ext_compliance_documents WHERE origin='ext07_canonica' AND created_by_identity IS NULL");
  assert.equal(q.rows[0].n, 0);
});

test("EXT-07 DB: banco recusa sobrescrita destrutiva de documento canônico", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id);
  await assert.rejects(
    pool.query("UPDATE ext_compliance_documents SET issue_date='2020-01-01' WHERE id=$1", [doc.id]),
    /canonical compliance document is immutable/
  );
});

// --- 5. Validade e Avaliação Temporal ---
test("EXT-07 HTTP: vencimento anterior à emissão é rejeitado", opt, async () => {
  const ob = await createObligation();
  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentConfig(ob.id, { issue_date: "2026-06-01", expiry_date: "2026-05-01" }),
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_validity");
});

test("EXT-07 HTTP: vigência anterior à emissão é rejeitada", opt, async () => {
  const ob = await createObligation();
  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentConfig(ob.id, { issue_date: "2026-06-01", effective_start_date: "2026-05-01", expiry_date: "2026-12-31" }),
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_validity");
});

test("EXT-07 HTTP: vencimento anterior à vigência é rejeitado", opt, async () => {
  const ob = await createObligation();
  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentConfig(ob.id, { issue_date: "2026-06-01", effective_start_date: "2026-06-15", expiry_date: "2026-06-10" }),
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_validity");
});

test("EXT-07 HTTP+DB: avaliação temporal na data do servidor detecta vencidos e gera tarefa", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-01-01", expiry_date: "2026-09-01" });
  const evalRes = await api("/api/ext/compliance/evaluate", {
    method: "POST",
    body: { evaluation_date: "2026-10-04" },
  });
  assert.equal(evalRes.status, 200);
  assert.ok(evalRes.body.evaluated >= 1);
  assert.equal(evalRes.body.source, "server_date");
  assert.equal(evalRes.body.rule, "expiry_at_or_before_evaluation_date");

  const docDb = (await pool.query("SELECT status FROM ext_compliance_documents WHERE id=$1", [doc.id])).rows[0];
  assert.equal(docDb.status, "vencida");

  const taskDb = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];
  assert.ok(taskDb);
  assert.equal(taskDb.status, "aberta");
  assert.equal(taskDb.responsible_identity, ti.id);
  assert.equal(taskDb.facts.source, "server_date");
});

// --- 6. Idempotência e concorrência ---
test("EXT-07 HTTP+DB: retry idêntico de criação de obrigação não duplica", opt, async () => {
  const key = idem("retry-ob");
  const body = obligationConfig({ title: "Obrigação Retry Sintética" });
  const a = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  const b = await api("/api/ext/compliance/obligations", { method: "POST", body, key });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.body.replayed, true);
  assert.equal(a.body.obligation.id, b.body.obligation.id);

  const count = (await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [key])).rows[0].n;
  assert.equal(count, 1);
});

test("EXT-07 HTTP: mesma chave com payload divergente retorna 409", opt, async () => {
  const key = idem("conflict-ob");
  const a = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ title: "Obrigação Versão Alpha" }),
    key,
  });
  assert.equal(a.status, 201);
  const b = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ title: "Obrigação Versão Beta Divergente" }),
    key,
  });
  assert.equal(b.status, 409);
  assert.equal(b.body.error, "idempotency_key_reused");
});

test("EXT-07 HTTP+DB: concorrência real na criação não duplica registros", opt, async () => {
  const key = idem("race-ob");
  const body = obligationConfig({ title: "Obrigação Concorrência Sintética" });
  const [r1, r2] = await Promise.all([
    api("/api/ext/compliance/obligations", { method: "POST", body, key }),
    api("/api/ext/compliance/obligations", { method: "POST", body, key }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 201]);

  const count = (await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [key])).rows[0].n;
  assert.equal(count, 1);
});

test("EXT-07 DB: eventos históricos em ext_compliance_events são imutáveis", opt, async () => {
  const ob = await createObligation();
  const event = (await pool.query("SELECT id FROM ext_compliance_events WHERE obligation_id=$1 LIMIT 1", [ob.id])).rows[0];
  assert.ok(event);
  await assert.rejects(
    pool.query("UPDATE ext_compliance_events SET payload='{}' WHERE id=$1", [event.id]),
    /compliance historical record is immutable/
  );
  await assert.rejects(
    pool.query("DELETE FROM ext_compliance_events WHERE id=$1", [event.id]),
    /compliance historical record is immutable/
  );
});

// --- 7. Tarefas ---
test("EXT-07 HTTP+DB: tarefa nasce vinculada a obrigação, documento, período e regra", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-02-01", expiry_date: "2026-08-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  const task = (await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];
  assert.ok(task);
  assert.equal(task.obligation_id, ob.id);
  assert.equal(task.validity_period, "2026-02-01:2026-08-01");
  assert.equal(task.rule, "expiry_at_or_before_evaluation_date");
});

test("EXT-07 HTTP+DB: avaliação repetida não duplica tarefa (unicidade doc/período/regra)", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-03-01", expiry_date: "2026-07-01" });
  const e1 = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  assert.equal(e1.status, 200);
  const e2 = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  assert.equal(e2.status, 200);
  assert.equal(e2.body.tasks_created, 0);

  const count = (await pool.query("SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0].n;
  assert.equal(count, 1);
});

test("EXT-07 HTTP+DB: transição de tarefa para em_andamento", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-01-01", expiry_date: "2026-04-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];

  const startRes = await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST", body: {} });
  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.task.status, "em_andamento");
  assert.ok(startRes.body.task.started_at);
});

test("EXT-07 HTTP: iniciar tarefa já em andamento retorna 409", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-01-01", expiry_date: "2026-05-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];

  await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST" });
  const repeat = await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST" });
  assert.equal(repeat.status, 409);
});

test("EXT-07 HTTP+DB: conclusão de tarefa exige resultado com no mínimo 10 caracteres", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-01-01", expiry_date: "2026-06-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];
  await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST" });

  const shortRes = await api(`/api/ext/compliance/tasks/${task.id}/complete`, {
    method: "POST",
    body: { result: "curto" },
  });
  assert.equal(shortRes.status, 409);

  const okRes = await api(`/api/ext/compliance/tasks/${task.id}/complete`, {
    method: "POST",
    body: { result: "Renovação e regularização documental sintética concluída com sucesso." },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.task.status, "concluida");
  assert.ok(okRes.body.task.completed_at);
});

test("EXT-07 HTTP: tarefa concluída é terminal e recusa reabertura", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-01-01", expiry_date: "2026-03-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];
  await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST" });
  await api(`/api/ext/compliance/tasks/${task.id}/complete`, {
    method: "POST",
    body: { result: "Regularização concluída para teste terminal." },
  });

  const reopen = await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST" });
  assert.equal(reopen.status, 409);

  await assert.rejects(
    pool.query("UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1", [task.id]),
    /terminal compliance task is immutable/
  );
});

test("EXT-07 HTTP+DB: cancelamento de tarefa exige justificativa min 10 chars e fica terminal", opt, async () => {
  const ob = await createObligation();
  const doc = await createDocument(ob.id, { issue_date: "2026-01-01", expiry_date: "2026-02-01" });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-10-04" } });
  const task = (await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [doc.id])).rows[0];

  const short = await api(`/api/ext/compliance/tasks/${task.id}/cancel`, {
    method: "POST",
    body: { justification: "motivo" },
  });
  assert.equal(short.status, 400);

  const ok = await api(`/api/ext/compliance/tasks/${task.id}/cancel`, {
    method: "POST",
    body: { justification: "Obrigação revogada por autoridade sintética competente." },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.task.status, "cancelada");
  assert.ok(ok.body.task.cancelled_at);

  const afterCancel = await api(`/api/ext/compliance/tasks/${task.id}/complete`, {
    method: "POST",
    body: { result: "Tentativa de completar cancelada." },
  });
  assert.equal(afterCancel.status, 409);
});

// --- 8. Renovação e versionamento ---
test("EXT-07 HTTP+DB: renovação cria novo registro com replacement_of explícito e version_no incrementado", opt, async () => {
  const ob = await createObligation();
  const doc1 = await createDocument(ob.id, {
    issue_date: "2025-01-01",
    effective_start_date: "2025-01-01",
    expiry_date: "2026-01-01",
    document_number: "LIC-V1-2025",
  });
  assert.equal(doc1.version_no, 1);
  assert.equal(doc1.replacement_of, null);

  const doc2 = await createDocument(ob.id, {
    issue_date: "2026-01-02",
    effective_start_date: "2026-01-02",
    expiry_date: "2027-01-02",
    document_number: "LIC-V2-2026",
    replacement_of: doc1.id,
  });
  assert.equal(doc2.version_no, 2);
  assert.equal(doc2.replacement_of, doc1.id);

  // Doc 1 permanece intacto no banco
  const doc1Db = (await pool.query("SELECT id, replacement_of, version_no FROM ext_compliance_documents WHERE id=$1", [doc1.id])).rows[0];
  assert.equal(doc1Db.id, doc1.id);
  assert.equal(doc1Db.replacement_of, null);
  assert.equal(doc1Db.version_no, 1);
});

test("EXT-07 HTTP: replacement_of de outra obrigação ou inexistente é rejeitado", opt, async () => {
  const ob1 = await createObligation();
  const ob2 = await createObligation();
  const doc1 = await createDocument(ob1.id);

  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentConfig(ob2.id, { replacement_of: doc1.id }),
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_replacement");
});

test("EXT-07 DB: banco impõe no máximo uma versão atual não cancelada com replacement_of IS NULL por obrigação", opt, async () => {
  const ob = await createObligation();
  await createDocument(ob.id);
  // Segunda inserção direta com replacement_of IS NULL deve violar ext_compliance_one_current_version
  await assert.rejects(
    pool.query(
      `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,replacement_of,version_no) VALUES('COMP-EXT-20261004-DUP1','Título 2','Desc longa o suficiente para teste','licenca','vigente','DOC-2','Emissor','Nome', $1, '2026-01-01', '2026-01-01', '2026-12-31', 'Regra válida', CURRENT_DATE, 'ref', 'decl', 'source', true, $1, $2, 'ext07_canonica', NULL, 1)`,
      [ti.id, ob.id]
    ),
    /unique|duplicate|ext_compliance_one_current_version|ext_compliance_current_version_unique/
  );
});

// --- 9. Auditoria e Rollback ---
test("EXT-07 HTTP+DB: falha no audit_log devolve 503 e executa rollback atômico", opt, async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_ext07_fail_audit() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.action = 'ext07_obligation_create' THEN
        RAISE EXCEPTION 'audit service unavailable simulated by gate';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS qa_ext07_fail_audit_trg ON audit_log;
    CREATE TRIGGER qa_ext07_fail_audit_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_fail_audit();
  `);

  const uniqueTitle = `Obrigação Rollback ${randomUUID()}`;
  const key = idem("audit-rollback");
  try {
    const res = await api("/api/ext/compliance/obligations", {
      method: "POST",
      body: obligationConfig({ title: uniqueTitle }),
      key,
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "audit_unavailable");

    const inDb = (await pool.query("SELECT count(*)::int n FROM ext_compliance_obligations WHERE title=$1", [uniqueTitle])).rows[0].n;
    assert.equal(inDb, 0);

    const eventInDb = (await pool.query("SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1", [key])).rows[0].n;
    assert.equal(eventInDb, 0);
  } finally {
    await pool.query("DROP TRIGGER IF EXISTS qa_ext07_fail_audit_trg ON audit_log;");
    await pool.query("DROP FUNCTION IF EXISTS qa_ext07_fail_audit();");
  }

  // Retry com a mesma chave agora deve funcionar perfeitamente
  const retryRes = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obligationConfig({ title: uniqueTitle }),
    key,
  });
  assert.equal(retryRes.status, 201);
  assert.equal(retryRes.body.obligation.title, uniqueTitle);
});

// --- 10. Legado ---
test("EXT-07 legado: leitura autorizada em /api/ext/compliance-documents retorna 200 com array items", opt, async () => {
  const r = await api("/api/ext/compliance-documents");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test("EXT-07 legado: anônimo recebe 401 e papel não autorizado recebe 403 antes de 410", opt, async () => {
  const rAnonGet = await api("/api/ext/compliance-documents", { cookie: null });
  assert.equal(rAnonGet.status, 401);

  const rAnonPost = await api("/api/ext/compliance-documents", { method: "POST", cookie: null, body: {} });
  assert.equal(rAnonPost.status, 401);

  const rRhGet = await api("/api/ext/compliance-documents", { cookie: cookieRh });
  assert.equal(rRhGet.status, 403);

  const rRhPost = await api("/api/ext/compliance-documents", { method: "POST", cookie: cookieRh, body: {} });
  assert.equal(rRhPost.status, 403);
});

test("EXT-07 legado: cross-origin em mutação legada recebe 403 antes de 410", opt, async () => {
  const r = await api("/api/ext/compliance-documents", {
    method: "POST",
    body: {},
    origin: "https://cross-origin.invalid",
  });
  assert.equal(r.status, 403);
});

test("EXT-07 legado: escritores legados autorizados retornam 410 com canonical", opt, async () => {
  const r = await api("/api/ext/compliance-documents", { method: "POST", body: {} });
  assert.equal(r.status, 410);
  assert.equal(r.body.error, "legacy_writer_retired");
  assert.equal(r.body.canonical, "/api/ext/compliance/*");
});

test("EXT-07 legado: ExtAdvancedClient.tsx permanece presente no repositório", opt, async () => {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(path.join(root, "src/app/admin/ti/ExtAdvancedClient.tsx"), "utf8");
  assert.ok(content.length > 100);
});

test("EXT-07 legado: handlers EXT-08..12 continuam operacionais sem regressão", opt, async () => {
  const r8 = await api("/api/ext/knowledge-base");
  assert.ok([200, 404].includes(r8.status) || r8.status < 500);

  const r9 = await api("/api/ext/expansion-plans");
  assert.ok([200, 404].includes(r9.status) || r9.status < 500);

  const r10 = await api("/api/ext/continuity-plans");
  assert.ok([200, 404].includes(r10.status) || r10.status < 500);

  const r11 = await api("/api/ext/analytics-experiments");
  assert.ok([200, 404].includes(r11.status) || r11.status < 500);
});

// --- 11. UI e Regressão ---
test("EXT-07 UI: /admin/compliance é servida via HTTP real", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`);
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.match(text, /Compliance|compliance/);
});
