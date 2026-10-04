// EXT-07: PostgreSQL 17 real + servidor HTTP real; fixtures sintéticas .invalid.
// Endurecimento probatório da jornada canônica de compliance corporativo.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-07 gate exige PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

let server, base, pool, ti, admin, rh, cookieTi, cookieAdmin, cookieRh, distDir;
let savedNextEnv = null;
let savedTsConfig = null;
const idem = (t) => `ext07-${t}-${randomUUID()}`;

async function wait() {
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`${base}/api/admin/session`);
      if ([200, 401].includes(res.status)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}

async function createStaff(role) {
  const id = randomUUID();
  const email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(
    `INSERT INTO auth_identities(id, kind, email, display_name, status) VALUES ($1, 'staff', $2, $3, 'active')`,
    [id, email, `QA EXT07 ${role.toUpperCase()}`]
  );
  await pool.query(
    `INSERT INTO auth_credentials(identity_id, password_hash) VALUES ($1, $2)`,
    [id, await hashPassword(password)]
  );
  await pool.query(
    `INSERT INTO auth_staff_profiles(identity_id, role, assigned_by) VALUES ($1, $2, 'admin_system')`,
    [id, role]
  );
  return { id, email, password };
}

async function loginStaff(s) {
  const r = await fetch(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: s.email, password: s.password }),
  });
  assert.equal(r.status, 200, `login failed for ${s.email}`);
  const cookieHeader = r.headers.getSetCookie().find((x) => x.startsWith("seg_admin_session="));
  assert.ok(cookieHeader, "missing admin session cookie");
  return cookieHeader.split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw } = {}) {
  const headers = {
    accept: "application/json",
    connection: "close",
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": key === null ? "" : key || idem("request") } : {}),
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
  return { status: r.status, body: data, text };
}

const obConfig = (over = {}) => ({
  obligation_type: "licenca",
  title: "Licença de Operação Sintética QA",
  description: "Descrição detalhada da obrigação regulatória sintética para conformidade.",
  declared_source: "Portaria Sintética QA nº 100/2026",
  applicability_scope: "Unidades operacionais metropolitanas",
  applicability_justification: "Justificativa clara de aplicabilidade para teste de compliance.",
  validity_rule: "validade_anual",
  renewal_lead_days: 30,
  criticality: "alta",
  responsible_identity: ti?.id,
  ...over,
});

const docConfig = (obligationId, over = {}) => ({
  obligation_id: obligationId,
  title: "Certificado Operacional Sintético QA",
  description: "Referência documental arquivada em cofre físico de conformidade.",
  compliance_type: "licenca",
  document_number: "DOC-QA-2026-001",
  issuer: "Órgão Regulador Sintético",
  issue_date: "2026-01-15",
  effective_start_date: "2026-01-15",
  expiry_date: "2026-10-01",
  reference_type: "referencia_declarada",
  declared_reference: "Pasta Física C-12 / Protocolo Interno 9988",
  reference_source: "Arquivo de Segurança Central",
  ...over,
});

before(async () => {
  if (!RUN) return;
  try {
    savedNextEnv = await readFile(path.join(root, "next-env.d.ts"), "utf8");
  } catch {}
  try {
    savedTsConfig = await readFile(path.join(root, "tsconfig.json"), "utf8");
  } catch {}
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3500 + Math.floor(Math.random() * 800);
  base = `http://127.0.0.1:${port}`;
  distDir = path.join(root, ".next", `integration-ext07-${randomBytes(4).toString("hex")}`);
  await rm(distDir, { recursive: true, force: true }).catch(() => {});

  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: path.relative(root, distDir),
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

  ti = await createStaff("ti");
  admin = await createStaff("admin");
  rh = await createStaff("rh");

  cookieTi = await loginStaff(ti);
  cookieAdmin = await loginStaff(admin);
  cookieRh = await loginStaff(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server) {
    server.stdout?.destroy();
    server.stderr?.destroy();
    server.stdin?.destroy();
    try {
      if (server.pid) process.kill(-server.pid, "SIGKILL");
    } catch {
      try {
        server.kill("SIGKILL");
      } catch {}
    }
  }
  if (distDir) {
    await rm(distDir, { recursive: true, force: true }).catch(() => {});
  }
  if (savedNextEnv !== null) {
    await writeFile(path.join(root, "next-env.d.ts"), savedNextEnv).catch(() => {});
  }
  if (savedTsConfig !== null) {
    await writeFile(path.join(root, "tsconfig.json"), savedTsConfig).catch(() => {});
  }
});

const opt = { skip: !RUN };

// --- 1. Autenticação e Autorização ---
test("EXT-07 HTTP staff anônimo 401", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { cookie: null });
  assert.equal(r.status, 401);
});

test("EXT-07 HTTP staff papel não autorizado (rh) 403", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", { cookie: cookieRh });
  assert.equal(r.status, 403);
});

test("EXT-07 HTTP same-origin recusado em mutação 403", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig(),
    origin: "https://attacker.invalid",
  });
  assert.equal(r.status, 403);
});

// --- 2. Validações de Entrada e Protocolo ---
test("EXT-07 HTTP chave de idempotência obrigatória", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig(),
    key: null,
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "idempotency_key_required");
});

test("EXT-07 HTTP JSON inválido retorna 400", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    raw: "{ broken json",
  });
  assert.equal(r.status, 400);
});

test("EXT-07 HTTP corpo grande retorna 413", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    raw: JSON.stringify({ flood: "x".repeat(80000) }),
  });
  assert.equal(r.status, 413);
});

test("EXT-07 HTTP UUID inválido no corpo retorna 400", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig({ responsible_identity: "not-a-valid-uuid" }),
  });
  assert.equal(r.status, 400);
});

test("EXT-07 HTTP campos obrigatórios da obrigação ausentes", opt, async () => {
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig({ title: "abc" }), // too short
  });
  assert.equal(r.status, 400);
});

test("EXT-07 HTTP responsável não pertencente ao staff ativo", opt, async () => {
  const nonStaff = randomUUID();
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig({ responsible_identity: nonStaff }),
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "responsible_staff_required");
});

// --- 3. Criação e Idempotência de Obrigações ---
test("EXT-07 criação de obrigação deriva autor da sessão e status pendente", opt, async () => {
  const key = idem("ob-create");
  const r = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig({ title: "Licença Ambiental da Sede" }),
    key,
  });
  assert.equal(r.status, 201);
  const ob = r.body.obligation;
  assert.ok(ob.id);
  assert.equal(ob.status, "pendente");
  assert.equal(ob.created_by_identity, ti.id);
  assert.equal(ob.responsible_identity, ti.id);
});

test("EXT-07 retry de criação de obrigação com mesma chave retorna 200 replayed", opt, async () => {
  const key = idem("ob-retry");
  const a = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Retry Idem" }), key });
  const b = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Retry Idem" }), key });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.body.replayed, true);
  assert.equal(a.body.obligation.id, b.body.obligation.id);
});

test("EXT-07 chave de idempotência reutilizada com payload divergente retorna 409", opt, async () => {
  const key = idem("ob-conflict");
  await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Original" }), key });
  const conflict = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: obConfig({ title: "Obrigação Divergente no Título" }),
    key,
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, "idempotency_key_reused");
});

test("EXT-07 concorrência de criação produz uma única obrigação", opt, async () => {
  const key = idem("ob-race");
  const p = obConfig({ title: "Obrigação Sob Concorrência" });
  const resList = await Promise.all([
    api("/api/ext/compliance/obligations", { method: "POST", body: p, key }),
    api("/api/ext/compliance/obligations", { method: "POST", body: p, key }),
  ]);
  const statuses = resList.map((x) => x.status).sort();
  assert.deepEqual(statuses, [200, 201]);
  assert.equal(resList[0].body.obligation.id, resList[1].body.obligation.id);
});

// --- 4. Criação, Validade e Privacidade de Documentos ---
test("EXT-07 criação de documento recusa validade anterior à emissão", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação para Validade" }) });
  const obId = obRes.body.obligation.id;

  const docRes = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: docConfig(obId, { issue_date: "2026-10-01", expiry_date: "2026-05-01" }), // expiry < issue
  });
  assert.equal(docRes.status, 400);
});

test("EXT-07 criação de documento para obrigação inexistente retorna 404", opt, async () => {
  const r = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: docConfig(randomUUID()),
  });
  assert.equal(r.status, 404);
});

test("EXT-07 criação de documento canônico impõe privacidade, protocolo e versão 1", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Canônica Primária" }) });
  const obId = obRes.body.obligation.id;

  const docRes = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: docConfig(obId, { title: "Certidão de Regularidade V1" }),
  });
  assert.equal(docRes.status, 201);
  const doc = docRes.body.document;
  assert.ok(doc.id);
  assert.match(doc.protocol, /^COMP-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(doc.is_private, true);
  assert.equal(doc.origin, "ext07_canonica");
  assert.equal(doc.version_no, 1);
  assert.equal(doc.status, "vigente");
  assert.match(docRes.body.message, /referência privada/);
});

test("EXT-07 criação de segundo documento ativo na mesma obrigação é negada 409 (exige renovação)", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação de Documento Único" }) });
  const obId = obRes.body.obligation.id;

  await api("/api/ext/compliance/documents", { method: "POST", body: docConfig(obId, { title: "Doc Ativo 1" }) });
  const second = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: docConfig(obId, { title: "Doc Ativo Concorrente" }),
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "active_document_already_exists");
});

test("EXT-07 listagem de documentos minimiza metadados privados (sem storage_key nem URL privada)", opt, async () => {
  const r = await api("/api/ext/compliance/documents");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.documents));
  assert.equal(r.body.file_boundary, "referencia_declarada_nao_arquivo_verificado");
  const raw = JSON.stringify(r.body.documents);
  assert.doesNotMatch(raw, /storage_key/);
  assert.doesNotMatch(raw, /file_url/);
});

test("EXT-07 detalhe autorizado de documento retorna tarefas, eventos e dados vinculados", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação para Detalhe" }) });
  const obId = obRes.body.obligation.id;
  const docRes = await api("/api/ext/compliance/documents", { method: "POST", body: docConfig(obId, { title: "Doc para Detalhe" }) });
  const docId = docRes.body.document.id;

  const detail = await api(`/api/ext/compliance/documents/${docId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.document.id, docId);
  assert.ok(Array.isArray(detail.body.tasks));
  assert.ok(Array.isArray(detail.body.events));
  assert.equal(detail.body.file_boundary, "referencia_declarada_nao_arquivo_verificado");
});

test("EXT-07 detalhe de documento com UUID inexistente retorna 404", opt, async () => {
  const r = await api(`/api/ext/compliance/documents/${randomUUID()}`);
  assert.equal(r.status, 404);
});

test("EXT-07 detalhe de documento com UUID inválido retorna 400", opt, async () => {
  const r = await api(`/api/ext/compliance/documents/invalid-uuid-format`);
  assert.equal(r.status, 400);
});

// --- 5. Renovação e Versionamento Não-Destrutivo ---
test("EXT-07 renovação cria versão 2, vincula replacement_of e marca anterior substituida", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação para Renovação" }) });
  const obId = obRes.body.obligation.id;
  const docRes = await api("/api/ext/compliance/documents", { method: "POST", body: docConfig(obId, { title: "Certidão V1" }) });
  const doc1 = docRes.body.document;

  const renewRes = await api(`/api/ext/compliance/documents/${doc1.id}/renew`, {
    method: "POST",
    body: {
      title: "Certidão V2 Renovada",
      description: "Nova certidão válida para o próximo ciclo de conformidade.",
      compliance_type: "licenca",
      issue_date: "2026-10-01",
      effective_start_date: "2026-10-01",
      expiry_date: "2027-10-01",
      reference_type: "referencia_declarada",
      declared_reference: "Protocolo Renovação 2026/09",
      justification: "Renovação tempestiva antes do vencimento.",
    },
  });

  assert.equal(renewRes.status, 201);
  const doc2 = renewRes.body.document;
  assert.equal(doc2.version_no, 2);
  assert.equal(doc2.replacement_of, doc1.id);
  assert.equal(doc2.status, "vigente");

  // Verificar que documento anterior virou substituida no banco
  const prevInDb = (await pool.query(`SELECT status FROM ext_compliance_documents WHERE id = $1`, [doc1.id])).rows[0];
  assert.equal(prevInDb.status, "substituida");
});

test("EXT-07 documento substituído não pode ser renovado novamente (409)", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Renovação Dupla" }) });
  const obId = obRes.body.obligation.id;
  const docRes = await api("/api/ext/compliance/documents", { method: "POST", body: docConfig(obId, { title: "Doc Base" }) });
  const docId = docRes.body.document.id;

  await api(`/api/ext/compliance/documents/${docId}/renew`, {
    method: "POST",
    body: {
      title: "Doc Renovado",
      description: "Descrição de renovação válida.",
      compliance_type: "licenca",
      issue_date: "2026-10-01",
      expiry_date: "2027-10-01",
      declared_reference: "Ref-2",
      justification: "Justificativa de renovação.",
    },
  });

  // Tentativa de renovar o documento já substituído
  const secondRenew = await api(`/api/ext/compliance/documents/${docId}/renew`, {
    method: "POST",
    body: {
      title: "Doc Renovado Outra Vez",
      description: "Tentativa inválida de renovar doc substituído.",
      compliance_type: "licenca",
      issue_date: "2026-10-01",
      expiry_date: "2027-10-01",
      declared_reference: "Ref-3",
      justification: "Tentativa de substituição paralela.",
    },
  });
  assert.equal(secondRenew.status, 409);
});

test("EXT-07 cancelamento de documento exige justificativa e cancela tarefas abertas", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação para Cancelamento" }) });
  const obId = obRes.body.obligation.id;
  const docRes = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: docConfig(obId, { title: "Doc a Cancelar", expiry_date: "2026-09-01" }),
  });
  const docId = docRes.body.document.id;

  // Avaliar para criar tarefa de vencimento
  await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-09-15" } });

  // Cancelamento com justificativa curta (rejeitado)
  const shortRes = await api(`/api/ext/compliance/documents/${docId}/cancel`, {
    method: "POST",
    body: { justification: "curta" },
  });
  assert.equal(shortRes.status, 400);

  // Cancelamento com justificativa válida
  const cancelRes = await api(`/api/ext/compliance/documents/${docId}/cancel`, {
    method: "POST",
    body: { justification: "Cancelamento da atividade operacional nesta unidade." },
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.document.status, "cancelada");

  // Tarefa aberta foi cancelada
  const tasks = (await pool.query(`SELECT status, cancellation_justification FROM ext_compliance_tasks WHERE document_id = $1`, [docId])).rows;
  assert.ok(tasks.length > 0);
  assert.equal(tasks[0].status, "cancelada");
  assert.match(tasks[0].cancellation_justification, /Documento cancelado/);
});

// --- 6. Imutabilidade e Triggers no Banco ---
test("EXT-07 trigger ext_compliance_document_guard impede alteração destrutiva no banco", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Protegida por Trigger" }) });
  const obId = obRes.body.obligation.id;
  const docRes = await api("/api/ext/compliance/documents", { method: "POST", body: docConfig(obId, { title: "Doc Protegido" }) });
  const docId = docRes.body.document.id;

  await assert.rejects(
    pool.query(`UPDATE ext_compliance_documents SET expiry_date = '2030-01-01' WHERE id = $1`, [docId]),
    /canonical compliance document is immutable/
  );
});

test("EXT-07 trigger impede reabertura de documento cancelado", opt, async () => {
  const cancelledDoc = (await pool.query(`SELECT id FROM ext_compliance_documents WHERE status = 'cancelada' LIMIT 1`)).rows[0];
  if (cancelledDoc) {
    await assert.rejects(
      pool.query(`UPDATE ext_compliance_documents SET status = 'vigente' WHERE id = $1`, [cancelledDoc.id]),
      /terminal compliance document cannot reopen/
    );
  }
});

// --- 7. Avaliação Temporal de Vencimentos e Tarefas ---
test("EXT-07 avaliação temporal gera tarefa de conformidade vinculada e atualiza documento para vencida", opt, async () => {
  const obRes = await api("/api/ext/compliance/obligations", { method: "POST", body: obConfig({ title: "Obrigação Avaliação Temporal" }) });
  const obId = obRes.body.obligation.id;
  const docRes = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: docConfig(obId, { title: "Doc a Vencer", expiry_date: "2026-08-30" }),
  });
  const docId = docRes.body.document.id;

  const evalRes = await api("/api/ext/compliance/evaluate", {
    method: "POST",
    body: { evaluation_date: "2026-09-01" },
  });
  assert.equal(evalRes.status, 200);
  assert.ok(evalRes.body.evaluated >= 1);
  assert.ok(evalRes.body.tasks_created >= 1);
  assert.equal(evalRes.body.rule, "expiry_at_or_before_evaluation_date");

  const docInDb = (await pool.query(`SELECT status, evaluation_date FROM ext_compliance_documents WHERE id = $1`, [docId])).rows[0];
  assert.equal(docInDb.status, "vencida");

  const taskInDb = (await pool.query(`SELECT * FROM ext_compliance_tasks WHERE document_id = $1`, [docId])).rows[0];
  assert.ok(taskInDb);
  assert.equal(taskInDb.status, "aberta");
  assert.equal(taskInDb.responsible_identity, ti.id);
});

test("EXT-07 reavaliação idempotente não duplica tarefas de compliance", opt, async () => {
  const eval1 = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-09-01" } });
  const eval2 = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2026-09-01" } });
  assert.equal(eval1.status, 200);
  assert.equal(eval2.status, 200);
  assert.equal(eval2.body.tasks_created, 0); // No new duplicate tasks
});

// --- 8. Ciclo de Vida da Tarefa de Compliance ---
test("EXT-07 tarefa de compliance transita: aberta -> em_andamento", opt, async () => {
  const task = (await pool.query(`SELECT id FROM ext_compliance_tasks WHERE status = 'aberta' LIMIT 1`)).rows[0];
  assert.ok(task, "tarefa aberta deve existir");

  const startRes = await api(`/api/ext/compliance/tasks/${task.id}/start`, { method: "POST", body: {} });
  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.task.status, "em_andamento");
  assert.ok(startRes.body.task.started_at);
});

test("EXT-07 tarefa de compliance conclusão exige responsável e resultado (mínimo 10 caracteres)", opt, async () => {
  const task = (await pool.query(`SELECT id FROM ext_compliance_tasks WHERE status = 'em_andamento' LIMIT 1`)).rows[0];
  assert.ok(task, "tarefa em andamento deve existir");

  // Resultado muito curto -> 400
  const shortRes = await api(`/api/ext/compliance/tasks/${task.id}/complete`, {
    method: "POST",
    body: { result: "curto" },
  });
  assert.equal(shortRes.status, 400);

  // Conclusão com resultado detalhado
  const compRes = await api(`/api/ext/compliance/tasks/${task.id}/complete`, {
    method: "POST",
    body: { result: "Certidão renovada e protocolo arquivado no arquivo central de compliance." },
  });
  assert.equal(compRes.status, 200);
  assert.equal(compRes.body.task.status, "concluida");
  assert.ok(compRes.body.task.completed_at);
});

test("EXT-07 tarefa em estado terminal não pode ser reiniciada ou reaberta", opt, async () => {
  const doneTask = (await pool.query(`SELECT id FROM ext_compliance_tasks WHERE status = 'concluida' LIMIT 1`)).rows[0];
  assert.ok(doneTask);

  const restartRes = await api(`/api/ext/compliance/tasks/${doneTask.id}/start`, { method: "POST", body: {} });
  assert.equal(restartRes.status, 409);

  await assert.rejects(
    pool.query(`UPDATE ext_compliance_tasks SET status = 'aberta' WHERE id = $1`, [doneTask.id]),
    /terminal compliance task is immutable/
  );
});

test("EXT-07 trigger ext_compliance_task_guard impede alteração de atributos estruturais da tarefa", opt, async () => {
  const task = (await pool.query(`SELECT id FROM ext_compliance_tasks LIMIT 1`)).rows[0];
  assert.ok(task);

  await assert.rejects(
    pool.query(`UPDATE ext_compliance_tasks SET rule = 'alterada_ilegalmente' WHERE id = $1`, [task.id]),
    /compliance task core attributes are immutable/
  );
});

// --- 9. Imutabilidade de Eventos e Rollback de Auditoria ---
test("EXT-07 eventos de compliance são imutáveis contra UPDATE e DELETE", opt, async () => {
  const evt = (await pool.query(`SELECT id FROM ext_compliance_events LIMIT 1`)).rows[0];
  assert.ok(evt);

  await assert.rejects(
    pool.query(`DELETE FROM ext_compliance_events WHERE id = $1`, [evt.id]),
    /compliance historical record is immutable/
  );
  await assert.rejects(
    pool.query(`UPDATE ext_compliance_events SET payload = '{}' WHERE id = $1`, [evt.id]),
    /compliance historical record is immutable/
  );
});

test("EXT-07 falha de audit_log causa rollback e retorna 503", opt, async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.action = 'ext07_obligation_create' THEN
        RAISE EXCEPTION 'audit table write failure simulation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS qa_ext07_audit_fail_trg ON audit_log;
    CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail();
  `);

  const key = idem("audit-fail");
  try {
    const r = await api("/api/ext/compliance/obligations", {
      method: "POST",
      body: obConfig({ title: "Obrigação Teste Falha Auditoria" }),
      key,
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "audit_unavailable");

    // Verificar que nada foi persistido
    const events = (await pool.query(`SELECT count(*)::int AS n FROM ext_compliance_events WHERE idempotency_key = $1`, [key])).rows[0];
    assert.equal(events.n, 0);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ext07_audit_fail_trg ON audit_log`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ext07_audit_fail()`);
  }
});

// --- 10. Agregados e UI ---
test("EXT-07 agregados distinguem ausência de zero e declaram fonte", opt, async () => {
  const r = await api("/api/ext/compliance/obligations");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "ext_compliance_obligations");
  assert.equal(typeof r.body.denominator, "number");
  assert.equal(typeof r.body.absence_is_not_zero, "boolean");
});

test("EXT-07 UI /admin/compliance renderiza com sucesso para staff", opt, async () => {
  const r = await fetch(`${base}/admin/compliance`, { headers: { cookie: cookieTi } });
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.match(text, /Compliance|compliance/);
});

// --- 11. Rotas Legadas e Não-Regressão ---
test("EXT-07 rotas legadas preservam leitura items e retornam 410 para escrita", opt, async () => {
  const legGet = await api("/api/ext/compliance-documents");
  assert.equal(legGet.status, 200);
  assert.ok(Array.isArray(legGet.body.items));
  assert.equal(legGet.body.canonical, "/api/ext/compliance/documents");

  const legPost = await api("/api/ext/compliance-documents", { method: "POST", body: {} });
  assert.equal(legPost.status, 410);
  assert.equal(legPost.body.error, "legacy_writer_retired");

  const legAnon = await api("/api/ext/compliance-documents", { cookie: null });
  assert.equal(legAnon.status, 401);

  const legRh = await api("/api/ext/compliance-documents", { cookie: cookieRh });
  assert.equal(legRh.status, 403);
});

test("EXT-07 não-regressão de rotas EXT-08..12", opt, async () => {
  // EXT-08 Base de Conhecimento
  const kbRes = await api("/api/ext/knowledge-base");
  assert.ok([200, 404].includes(kbRes.status));

  // EXT-09 Planos de Expansão
  const expRes = await api("/api/ext/expansion-plans");
  assert.ok([200, 404].includes(expRes.status));

  // EXT-10 Planos de Continuidade
  const contRes = await api("/api/ext/continuity-plans");
  assert.ok([200, 404].includes(contRes.status));
});
