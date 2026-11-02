// PLT-01 — cobertura da revisão periódica de acessos: HTTP real + PostgreSQL real.
// Somente dados sintéticos .invalid. Não prova aceite humano, UAT nem produção.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_PLT01_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
test("PLT-01 gate exige banco real e não aceita skip silencioso", () => { if (REQUIRE) assert.ok(RUN); });

// Segredo e chave compartilhados entre as instâncias: a sessão criada no
// servidor principal precisa valer nos servidores com regra declarada.
const SESSION_SECRET = randomUUID().repeat(2);
const MFA_KEY = randomBytes(32).toString("base64url");

let server, base, pool, ti, rh, cookieTi, cookieRh, declaredBase;
const extraServers = [];

function serverEnv(port, extra, distDir) {
  return {
    ...process.env,
    PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development",
    // Cada instância usa um distDir próprio: o Next dev recusa duas instâncias
    // no mesmo diretório de build.
    NEXT_DIST_DIR: distDir,
    SITE_ADMIN_SESSION_SECRET: SESSION_SECRET,
    CLIENT_MFA_ENCRYPTION_KEY: MFA_KEY,
    SITE_ADMIN_LEGACY_TOKENS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "",
    NEXT_TELEMETRY_DISABLED: "1",
    ACCESS_REVIEW_INTERVAL_DAYS: "",
    ...extra,
  };
}

async function startServer(extra = {}) {
  const port = 3600 + Math.floor(Math.random() * 1200);
  const distDir = `.next/integration-plt01-${randomUUID().slice(0, 8)}`;
  const child = spawn(process.execPath, ["server.mjs", "--dev"], { cwd: root, env: serverEnv(port, extra, distDir), stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      const response = await fetch(`${origin}/api/admin/session`);
      if ([200, 401].includes(response.status)) return { child, origin };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  child.kill("SIGKILL");
  throw new Error(`server_did_not_start\n${logs.slice(-3000)}`);
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 300));
  child.kill("SIGKILL");
}

async function staff(role) {
  const id = randomUUID();
  const email = `qa-plt01-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA PLT-01 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}

async function login(origin, person) {
  const response = await fetch(`${origin}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: person.email, password: person.password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("seg_admin_session="));
  assert.ok(cookie, "sessão de staff esperada");
  return cookie.split(";")[0];
}

const get = (url, cookie = cookieTi, origin = base) => fetch(`${origin}${url}`, { headers: { accept: "application/json", ...(cookie ? { cookie } : {}) } });
const post = (url, body, options = {}) => fetch(`${options.origin || base}${url}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: options.originBase || base,
    ...(options.cookie === null ? {} : { cookie: options.cookie ?? cookieTi }),
  },
  body: JSON.stringify(body),
});
const coverage = async (query = "", origin = base, cookie = cookieTi) => {
  const response = await get(`/api/admin/access-reviews?view=coverage${query}`, cookie, origin);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { response, body, text };
};

before(async () => {
  if (!RUN) return;
  ({ child: server, origin: base } = await startServer());
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  ti = await staff("ti");
  rh = await staff("rh");
  cookieTi = await login(base, ti);
  cookieRh = await login(base, rh);
});

after(async () => {
  for (const { child } of extraServers) await stopServer(child);
  await pool?.end().catch(() => {});
  await stopServer(server);
});

const opt = { skip: !RUN };

test("PLT-01 HTTP: anônimo recebe 401 na cobertura", opt, async () => {
  const { response, body } = await coverage("", base, null);
  assert.equal(response.status, 401);
  assert.equal(body.error, "admin_session_required");
});

test("PLT-01 HTTP: papel rh recebe 403 sem permissão de revisão", opt, async () => {
  const { response, body } = await coverage("", base, cookieRh);
  assert.equal(response.status, 403);
  assert.equal(body.error, "permission_required");
  assert.equal(body.permission, "admin.access_review");
});

test("PLT-01 HTTP+DB: sem regra declarada não há prazo inventado", opt, async () => {
  const { response, body } = await coverage();
  assert.equal(response.status, 200);
  assert.equal(body.regra.declarada, false);
  assert.equal(body.regra.intervalo_dias, null);
  assert.equal(body.regra.motivo, "nao_informada");
  assert.equal(body.regra.variavel, "ACCESS_REVIEW_INTERVAL_DAYS");
  assert.equal(body.escopo, "staff_ativo");
  assert.equal(body.fonte, "auth_access_reviews");
  assert.deepEqual(body.fronteira, {
    altera_permissoes: false, revoga_acesso: false, substitui_decisao_humana: false, veredito_sem_regra_declarada: false,
  });
  assert.equal(body.resumo.pendentes, 0);
  const emails = body.identidades.map(row => row.email);
  assert.ok(emails.includes(ti.email), "identidade ti criada no teste precisa aparecer");
  assert.ok(emails.includes(rh.email), "identidade rh criada no teste precisa aparecer");
  for (const row of body.identidades) {
    assert.ok(["em_dia", "vencida", "nunca_revisada", "revisado_sem_regra"].includes(row.situacao));
    assert.equal(row.pendente, false, "sem regra nenhum registro é pendente");
  }
});

test("PLT-01 HTTP: limite é aplicado e truncamento é declarado", opt, async () => {
  const { body } = await coverage("&limit=1");
  assert.equal(body.limite, 1);
  assert.equal(body.identidades.length, 1);
  assert.equal(body.truncado, true);
  assert.ok(body.resumo.total > 1);
  const loose = await coverage("&limit=abc");
  assert.equal(loose.body.limite, 200);
});

test("PLT-01 HTTP+DB: POST na visão de cobertura responde 405 e não grava revisão", opt, async () => {
  const before = (await pool.query("SELECT count(*)::int AS n FROM auth_access_reviews")).rows[0].n;
  const response = await post("/api/admin/access-reviews?view=coverage", { targetIdentityId: rh.id, decision: "keep" });
  assert.equal(response.status, 405);
  assert.equal((await response.json()).error, "method_not_allowed");
  const afterCount = (await pool.query("SELECT count(*)::int AS n FROM auth_access_reviews")).rows[0].n;
  assert.equal(afterCount, before);
});

test("PLT-01 HTTP+DB: revisão registrada passa a aparecer como fato na cobertura", opt, async () => {
  const created = await post("/api/admin/access-reviews", { targetIdentityId: ti.id, decision: "keep", notes: "Revisão sintética registrada pelo QA." }, { originBase: base });
  assert.equal(created.status, 201);
  const reviewId = (await created.json()).reviewId;
  assert.ok(reviewId);

  const { body } = await coverage();
  const row = body.identidades.find(item => item.identity_id === ti.id);
  assert.ok(row, "identidade revisada precisa aparecer");
  assert.equal(row.situacao, "revisado_sem_regra");
  assert.equal(row.revisoes_registradas, 1);
  assert.ok(row.ultima_revisao_em, "data da revisão precisa ser derivada do banco");
  assert.equal(row.pendente, false);
  assert.equal(body.resumo.revisado_sem_regra >= 1, true);
  const audit = await pool.query("SELECT count(*)::int AS n FROM auth_access_audit WHERE action='access_review' AND target=$1", [ti.id]);
  assert.equal(audit.rows[0].n, 1, "a revisão existente continua auditada");
});

test("PLT-01 HTTP+DB: a cobertura é somente leitura e não audita nem altera revisões", opt, async () => {
  const reviewsBefore = (await pool.query("SELECT count(*)::int AS n FROM auth_access_reviews")).rows[0].n;
  const auditBefore = (await pool.query("SELECT count(*)::int AS n FROM auth_access_audit")).rows[0].n;
  const permissionsBefore = (await pool.query("SELECT count(*)::int AS n FROM auth_permissions WHERE revoked_at IS NULL")).rows[0].n;
  for (let i = 0; i < 3; i++) assert.equal((await coverage()).response.status, 200);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM auth_access_reviews")).rows[0].n, reviewsBefore);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM auth_access_audit")).rows[0].n, auditBefore);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM auth_permissions WHERE revoked_at IS NULL")).rows[0].n, permissionsBefore);
});

test("PLT-01 HTTP+DB: regra declarada em 180 dias classifica revisão recente como em dia", opt, async () => {
  const declared = await startServer({ ACCESS_REVIEW_INTERVAL_DAYS: "180" });
  extraServers.push(declared);
  declaredBase = declared.origin;
  const response = await get("/api/admin/access-reviews?view=coverage", cookieTi, declared.origin);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.regra.declarada, true);
  assert.equal(body.regra.intervalo_dias, 180);
  assert.equal(body.regra.fonte, "env:ACCESS_REVIEW_INTERVAL_DAYS");
  const reviewed = body.identidades.find(item => item.identity_id === ti.id);
  assert.equal(reviewed.situacao, "em_dia");
  assert.equal(reviewed.pendente, false);
  const never = body.identidades.find(item => item.identity_id === rh.id);
  assert.equal(never.situacao, "nunca_revisada");
  assert.equal(never.pendente, true);
  assert.ok(body.resumo.pendentes >= 1);
});

test("PLT-01 HTTP+DB: revisão antiga no banco vira vencida quando a regra é declarada", opt, async () => {
  await pool.query("INSERT INTO auth_access_reviews(id,reviewed_by,target_identity_id,decision,notes,created_at) VALUES($1,$2,$3,'keep','Revisão sintética antiga para prova de atraso.',NOW() - INTERVAL '400 days')", [randomUUID(), ti.id, rh.id]);
  const response = await get("/api/admin/access-reviews?view=coverage", cookieTi, declaredBase);
  const body = await response.json();
  const row = body.identidades.find(item => item.identity_id === rh.id);
  assert.equal(row.situacao, "vencida");
  assert.equal(row.pendente, true);
  assert.ok(row.dias_desde_ultima_revisao >= 399);
  assert.equal(body.resumo.vencida, 1);
});

test("PLT-01 HTTP: a listagem existente de revisões segue respondendo o contrato original", opt, async () => {
  const response = await get("/api/admin/access-reviews");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.reviews));
  assert.ok(body.reviews.some(review => review.target_identity_id === ti.id));
  assert.equal(body.regra, undefined, "a visão padrão não ganha campos novos");
});

test("PLT-01 HTTP: console de TI continua servido", opt, async () => {
  const response = await fetch(`${base}/admin/ti`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/i);
});
