// F15 — caixa interna de pendências: PostgreSQL 17 descartável + servidor HTTP real.
// SQL prepara apenas identidades staff fictícias, credenciais, grants e controles de teste.
// As pendências de origem (obrigação, plano de ação de compliance e plano de continuidade)
// nascem exclusivamente por HTTP canônico; a varredura é exercida pela rota real.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_PENDENCY_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const uuid = () => randomUUID();
const key = (name) => `pendency-${name}-${uuid()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(init.method && init.method !== "GET" ? 60000 : 30000) });

let server;
let base;
let pool;
let logs = "";
let admin;
let ti;
let rh;
let cookieAdmin;
let cookieTi;
let cookieRh;
let obligation;
let actionPlan;
let continuityPlan;
const sessionSecret = randomUUID().repeat(2);

async function createStaff(role, tag) {
  const id = uuid();
  const email = `pendency-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,'active')`, [id, email, `QA F15 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}

async function grant(identityId, permission) {
  await pool.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,'global',$4,'admin','QA F15 autorização granular') ON CONFLICT DO NOTHING`,
    [uuid(), identityId, permission, identityId],
  );
}

async function login(staff) {
  const response = await fetchTimeout(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: staff.email, password: staff.password }),
  });
  assert.equal(response.status, 200, `login falhou para ${staff.role}`);
  return response.headers.getSetCookie().find((item) => item.startsWith("seg_admin_session=")).split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieAdmin, body, idempotencyKey, origin = base, headers = {} } = {}) {
  const requestHeaders = {
    accept: "application/json",
    origin,
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": idempotencyKey === null ? "" : idempotencyKey || key("request") } : {}),
    ...headers,
  };
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  const response = await fetchTimeout(base + url, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: parsed };
}

async function waitForServer() {
  for (let i = 0; i < 240; i += 1) {
    try {
      const ready = await fetchTimeout(`${base}/api/admin/session`);
      if ([200, 401].includes(ready.status)) return;
    } catch {}
    if (i === 239) throw new Error(`server_did_not_start\n${logs.slice(-4000)}`);
    await wait(400);
  }
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  const port = 4900 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-pendency",
      SITE_ADMIN_SESSION_SECRET: sessionSecret,
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  await waitForServer();

  admin = await createStaff("admin", "admin");
  ti = await createStaff("ti", "ti");
  rh = await createStaff("rh", "rh");
  await grant(admin.id, "pendency.sweep");
  for (const permission of ["continuity.read", "continuity.write", "continuity.activate"]) await grant(admin.id, permission);
  cookieAdmin = await login(admin);
  cookieTi = await login(ti);
  cookieRh = await login(rh);
});

after(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), wait(3000)]);
    if (!server.killed) server.kill("SIGKILL");
  }
  await pool?.end().catch(() => {});
  if (logs.trim()) console.error(`SERVER_LOGS_TAIL_BEGIN\n${logs.slice(-6000)}\nSERVER_LOGS_TAIL_END`);
});

const opt = { skip: !RUN };

test("F15 gate exige banco PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

test("F15 cluster limpo não tem pendências e a caixa HTTP está vazia", opt, async () => {
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM ops_pendency_notifications")).rows[0].n, 0);
  const listed = await api("/api/ops/pendencies");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items, []);
  assert.equal(listed.body.unread, 0);
  assert.match(listed.body.note, /nenhuma mensagem externa/);
});

test("F15 caixa e varredura são fail-closed para anônimo e cookie inválido", opt, async () => {
  assert.equal((await api("/api/ops/pendencies", { cookie: null })).status, 401);
  assert.equal((await api("/api/ops/pendencies", { cookie: "seg_admin_session=invalido" })).status, 401);
  assert.equal((await api("/api/ops/pendencies/sweep", { method: "POST", cookie: null, body: {} })).status, 401);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM ops_pendency_notifications")).rows[0].n, 0);
});

test("F15 varredura exige permissão granular, same-origin e chave de idempotência", opt, async () => {
  const withoutPermission = await api("/api/ops/pendencies/sweep", { method: "POST", cookie: cookieRh, body: {} });
  assert.equal(withoutPermission.status, 403);
  assert.equal(withoutPermission.body.error, "forbidden");
  const tiSweep = await api("/api/ops/pendencies/sweep", { method: "POST", cookie: cookieTi, body: {} });
  assert.equal(tiSweep.status, 403, "sem grant explícito nem o TI varre");
  const crossOrigin = await api("/api/ops/pendencies/sweep", { method: "POST", body: {}, origin: "https://attacker.invalid" });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.body.error, "origin_forbidden");
  const noKey = await api("/api/ops/pendencies/sweep", { method: "POST", body: {}, idempotencyKey: null });
  assert.equal(noKey.status, 400);
  assert.equal(noKey.body.error, "idempotency_key_required");
});

test("F15 varredura sem pendência real não inventa nada", opt, async () => {
  const swept = await api("/api/ops/pendencies/sweep", { method: "POST", body: {} });
  assert.equal(swept.status, 200);
  assert.equal(swept.body.total, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM ops_pendency_notifications")).rows[0].n, 0);
  const audited = (await pool.query(
    "SELECT count(*)::int AS n FROM auth_access_audit WHERE actor_id=$1 AND action='ops_pendency_sweep'",
    [admin.id],
  )).rows[0].n;
  assert.equal(audited, 1, "a varredura precisa ficar auditada mesmo sem resultado");
});

test("F15 fontes reais nascem por HTTP: obrigação, plano de ação vencido e teste de continuidade vencido", opt, async () => {
  const createdObligation = await api("/api/ext/compliance/obligations", {
    method: "POST",
    cookie: cookieTi,
    body: {
      obligation_type: "licenca_sintetica",
      title: "Obrigação sintética do gate F15",
      description: "Obrigação fictícia criada apenas para o gate interno de pendências.",
      declared_source: "Fonte declarada sintética do gate",
      applicability_scope: "Escopo sintético",
      applicability_justification: "Justificativa sintética de aplicabilidade para o gate.",
      validity_rule: "Regra sintética de validade",
      responsible_identity: admin.id,
    },
  });
  assert.equal(createdObligation.status, 201);
  obligation = createdObligation.body.obligation;

  const createdPlan = await api("/api/ext/compliance/action-plans", {
    method: "POST",
    cookie: cookieTi,
    body: {
      obligation_id: obligation.id,
      plan_type: "corretivo",
      title: "Plano de ação vencido do gate",
      description: "Plano de ação sintético com prazo já vencido para alimentar a caixa interna.",
      due_date: "2026-01-05",
      responsible_identity: admin.id,
    },
  });
  assert.equal(createdPlan.status, 201);
  actionPlan = createdPlan.body.action_plan || createdPlan.body.plan;
  assert.ok(actionPlan?.id, `resposta inesperada: ${JSON.stringify(createdPlan.body).slice(0, 300)}`);

  const createdContinuity = await api("/api/ext/continuity/plans", {
    method: "POST",
    body: {
      title: "Plano de continuidade com teste vencido",
      description: "Plano sintético com próximo teste já vencido para alimentar a caixa interna.",
      responsible_name: "Responsável sintético F15",
      next_test_due: "2026-02-10",
    },
  });
  assert.equal(createdContinuity.status, 201);
  continuityPlan = createdContinuity.body.plan;
  const approved = await api(`/api/ext/continuity/plans/${continuityPlan.id}/transition`, { method: "POST", body: { status: "aprovado" } });
  assert.equal(approved.status, 200);
  // O responsável do plano de continuidade é a identidade que o criou (sessão admin).
  assert.equal((await pool.query("SELECT responsible_identity FROM ext_continuity_plans WHERE id=$1", [continuityPlan.id])).rows[0].responsible_identity, admin.id);
});

test("F15 varredura materializa pendências reais para o responsável correto", opt, async () => {
  const swept = await api("/api/ops/pendencies/sweep", { method: "POST", body: {} });
  assert.equal(swept.status, 200);
  assert.equal(swept.body.total, 2);
  assert.equal(swept.body.created.ext07_action_plan, 1);
  assert.equal(swept.body.created.ext10_continuity_plan, 1);
  assert.equal(swept.body.created.ext07_obligation, 0, "obrigação ainda não está vencida: nada deve ser inventado");
  const rows = (await pool.query(
    "SELECT source_module, source_id, recipient_identity, status FROM ops_pendency_notifications ORDER BY source_module",
  )).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.recipient_identity, admin.id);
    assert.equal(row.status, "nao_lida");
  }
  assert.deepEqual(rows.map((row) => row.source_module), ["ext07_action_plan", "ext10_continuity_plan"]);
  assert.equal(rows.find((row) => row.source_module === "ext07_action_plan").source_id, actionPlan.id);
  const listed = await api("/api/ops/pendencies");
  assert.equal(listed.body.items.length, 2);
  assert.equal(listed.body.unread, 2);
});

test("F15 varredura repetida é idempotente e não duplica a mesma pendência", opt, async () => {
  const again = await api("/api/ops/pendencies/sweep", { method: "POST", body: {} });
  assert.equal(again.status, 200);
  assert.equal(again.body.total, 0);
  const third = await api("/api/ops/pendencies/sweep", { method: "POST", body: {} });
  assert.equal(third.body.total, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM ops_pendency_notifications")).rows[0].n, 2);
});

test("F15 caixa é pessoal: outra identidade staff não enxerga nem trata a pendência alheia", opt, async () => {
  const otherInbox = await api("/api/ops/pendencies", { cookie: cookieTi });
  assert.equal(otherInbox.status, 200);
  assert.deepEqual(otherInbox.body.items, []);
  const target = (await pool.query("SELECT id FROM ops_pendency_notifications LIMIT 1")).rows[0].id;
  const foreignRead = await api(`/api/ops/pendencies/${target}/read`, { method: "POST", cookie: cookieTi, body: {} });
  assert.equal(foreignRead.status, 404);
  assert.equal(foreignRead.body.error, "pendency_not_found");
  const foreignArchive = await api(`/api/ops/pendencies/${target}/archive`, {
    method: "POST",
    cookie: cookieTi,
    body: { note: "Tentativa de arquivar pendência de outra pessoa." },
  });
  assert.equal(foreignArchive.status, 404);
  assert.equal((await pool.query("SELECT status FROM ops_pendency_notifications WHERE id=$1", [target])).rows[0].status, "nao_lida");
});

test("F15 marcar como lida é idempotente e auditado", opt, async () => {
  const target = (await pool.query("SELECT id FROM ops_pendency_notifications WHERE source_module='ext07_action_plan'")).rows[0].id;
  const first = await api(`/api/ops/pendencies/${target}/read`, { method: "POST", body: {} });
  assert.equal(first.status, 200);
  assert.equal(first.body.pendency.status, "lida");
  const replay = await api(`/api/ops/pendencies/${target}/read`, { method: "POST", body: {} });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  const audited = (await pool.query(
    "SELECT count(*)::int AS n FROM auth_access_audit WHERE actor_id=$1 AND action='ops_pendency_read'",
    [admin.id],
  )).rows[0].n;
  assert.equal(audited, 2);
  const unread = (await api("/api/ops/pendencies?status=nao_lida")).body.items.length;
  assert.equal(unread, 1);
});

test("F15 arquivamento exige justificativa e torna a pendência terminal", opt, async () => {
  const target = (await pool.query("SELECT id FROM ops_pendency_notifications WHERE source_module='ext07_action_plan'")).rows[0].id;
  const short = await api(`/api/ops/pendencies/${target}/archive`, { method: "POST", body: { note: "curta" } });
  assert.equal(short.status, 400);
  assert.equal(short.body.error, "archive_note_required");
  const archived = await api(`/api/ops/pendencies/${target}/archive`, {
    method: "POST",
    body: { note: "Pendência tratada internamente durante o gate de pendências." },
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.pendency.status, "arquivada");
  assert.ok(archived.body.pendency.archived_at);
  const reread = await api(`/api/ops/pendencies/${target}/read`, { method: "POST", body: {} });
  assert.equal(reread.status, 409);
  assert.equal(reread.body.error, "pendency_archived");
});

test("F15 banco recusa adulteração direta: arquivada imutável, deleção física e destinatário inválido", opt, async () => {
  const archived = (await pool.query("SELECT id FROM ops_pendency_notifications WHERE status='arquivada'")).rows[0].id;
  await assert.rejects(() => pool.query("UPDATE ops_pendency_notifications SET status='nao_lida' WHERE id=$1", [archived]));
  await assert.rejects(() => pool.query("UPDATE ops_pendency_notifications SET summary='adulterado pelo gate' WHERE id=$1", [archived]));
  await assert.rejects(() => pool.query("DELETE FROM ops_pendency_notifications WHERE id=$1", [archived]));
  const clientIdentity = uuid();
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'client',$2,'QA F15 cliente','active')`,
    [clientIdentity, `pendency-client-${clientIdentity.slice(0, 8)}@example.invalid`],
  );
  await assert.rejects(() => pool.query(
    `INSERT INTO ops_pendency_notifications (recipient_identity,source_module,source_id,source_fingerprint,title,summary,generated_by_identity)
     VALUES ($1,'ext07_task',$2,'fingerprint-sintetico-01','Pendência inválida','Destinatário não é staff ativo e deve falhar.',$3)`,
    [clientIdentity, uuid(), admin.id],
  ));
});

test("F15 mudança real no estado da origem gera nova pendência (fingerprint muda)", opt, async () => {
  const started = await api(`/api/ext/compliance/action-plans/${actionPlan.id}/start`, { method: "POST", cookie: cookieTi, body: {} });
  assert.equal(started.status, 200, `resposta inesperada: ${JSON.stringify(started.body).slice(0, 200)}`);
  const swept = await api("/api/ops/pendencies/sweep", { method: "POST", body: {} });
  assert.equal(swept.body.created.ext07_action_plan, 1, "estado novo da origem precisa gerar pendência nova");
  const fingerprints = (await pool.query(
    "SELECT DISTINCT source_fingerprint FROM ops_pendency_notifications WHERE source_module='ext07_action_plan'",
  )).rows;
  assert.equal(fingerprints.length, 2);
  const inbox = await api("/api/ops/pendencies?status=nao_lida");
  assert.equal(inbox.body.items.length, 2);
});

test("F15 nada é enfileirado para entrega externa e nenhum canal é acionado", opt, async () => {
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM notification_queue")).rows[0].n, 0);
  const channels = (await pool.query(
    "SELECT count(*)::int AS n FROM auth_access_audit WHERE action IN ('notification_enqueue','notification_send','notification_retry')",
  )).rows[0].n;
  assert.equal(channels, 0);
  assert.doesNotMatch(logs, /smtp|sendMail|mail sent/i);
});

test("F15 rota desconhecida e método inválido falham fechados na borda HTTP", opt, async () => {
  assert.equal((await api("/api/ops/pendencies/inventado/enviar")).status, 404);
  assert.equal((await api("/api/ops/pendencies", { method: "DELETE", body: {} })).status, 405);
  assert.equal((await api("/api/ops/pendencies/sweep")).status, 405);
});

test("F15 auditoria cobre varredura, leitura e arquivamento sem categoria sensível", opt, async () => {
  const rows = (await pool.query(
    `SELECT action, count(*)::int AS n FROM auth_access_audit
      WHERE actor_id=$1 AND action LIKE 'ops_pendency_%' GROUP BY action ORDER BY action`,
    [admin.id],
  )).rows;
  const actions = Object.fromEntries(rows.map((row) => [row.action, row.n]));
  assert.ok(actions.ops_pendency_sweep >= 4);
  assert.equal(actions.ops_pendency_read, 2);
  assert.equal(actions.ops_pendency_archive, 1);
  const categories = (await pool.query(
    "SELECT DISTINCT detail_category FROM auth_access_audit WHERE action LIKE 'ops_pendency_%'",
  )).rows.map((row) => row.detail_category);
  assert.deepEqual(categories, ["none"]);
});

test("F15 origem cujo responsável deixou de ser staff ativo não gera pendência para ninguém", opt, async () => {
  const temporary = await createStaff("admin", "temp");
  for (const permission of ["continuity.read", "continuity.write", "continuity.activate"]) await grant(temporary.id, permission);
  const cookieTemporary = await login(temporary);
  const created = await api("/api/ext/continuity/plans", {
    method: "POST",
    cookie: cookieTemporary,
    body: {
      title: "Plano de continuidade de responsável desligado",
      description: "Plano sintético cujo responsável será desativado antes da varredura.",
      responsible_name: "Responsável desligado",
      next_test_due: "2026-03-15",
    },
  });
  assert.equal(created.status, 201);
  const approved = await api(`/api/ext/continuity/plans/${created.body.plan.id}/transition`, { method: "POST", cookie: cookieTemporary, body: { status: "aprovado" } });
  assert.equal(approved.status, 200);
  await pool.query("UPDATE auth_identities SET status='disabled' WHERE id=$1", [temporary.id]);

  const swept = await api("/api/ops/pendencies/sweep", { method: "POST", body: {} });
  assert.equal(swept.status, 200);
  assert.equal(swept.body.created.ext10_continuity_plan, 0, "responsável inativo não pode receber nem transferir pendência");
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM ops_pendency_notifications WHERE source_id=$1", [created.body.plan.id])).rows[0].n,
    0,
  );
  const inboxes = (await pool.query("SELECT DISTINCT recipient_identity FROM ops_pendency_notifications")).rows;
  assert.deepEqual(inboxes.map((row) => row.recipient_identity), [admin.id], "nenhuma pendência pode ser redirecionada a outra caixa");
});
