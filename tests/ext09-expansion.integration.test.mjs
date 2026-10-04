// EXT-09: Planejamento de Expansão, Capacidade e Cenários Financeiros.
// PostgreSQL 17 real + servidor HTTP real; fixtures sintéticas .invalid.
// Executado pelo gate dedicado (npm run test:ext09-expansion:pg) com cluster descartável.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT09_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-09 gate exige PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

let server, base, pool, serverLogs = "";
let admin, ti, marcelo, comercial, financeiro, rh;
let cookieAdmin, cookieTi, cookieMarcelo, cookieComercial, cookieFinanceiro, cookieRh;

const idem = (t) => `ext09-${t}-${randomUUID()}`;
const fetchWithTimeout = (url, init = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(init.method === "POST" || init.method === "PATCH" || init.method === "DELETE" ? 60000 : 30000) });

async function waitServer() {
  for (let i = 0; i < 240; i++) {
    try {
      const res = await fetchWithTimeout(`${base}/api/admin/session`, { signal: undefined });
      if ([200, 401].includes(res.status)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}

async function createStaff(role, tag) {
  const id = randomUUID();
  const email = `ext09-${tag || role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1, 'staff', $2, $3, 'active')`,
    [id, email, `QA EXT09 ${role.toUpperCase()}`]
  );
  await pool.query(
    `INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1, $2)`,
    [id, await hashPassword(password)]
  );
  await pool.query(
    `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1, $2, 'admin_system')`,
    [id, role]
  );
  return { id, email, password, role };
}

async function loginStaff(s) {
  const r = await fetchWithTimeout(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: s.email, password: s.password }),
  });
  assert.equal(r.status, 200, `Falha no login do papel ${s.role}`);
  const setCookie = r.headers.getSetCookie();
  const sessionCookie = setCookie.find((x) => x.startsWith("seg_admin_session="));
  assert.ok(sessionCookie, "Cookie de sessão deve ser emitido");
  return sessionCookie.split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieAdmin, body, key, origin = base, raw } = {}) {
  const headers = {
    accept: "application/json",
    origin,
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": key === null ? "" : key || idem("request") } : {}),
  };
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const r = await fetchWithTimeout(base + url, {
    method,
    headers,
    body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { status: r.status, body: data, text };
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3800 + Math.floor(Math.random() * 800);
  base = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext09",
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (x) => (serverLogs += x));
  server.stderr.on("data", (x) => (serverLogs += x));

  try {
    await waitServer();
  } catch (e) {
    throw new Error(`${e.message}\n${serverLogs.slice(-3000)}`);
  }

  admin = await createStaff("admin");
  ti = await createStaff("ti");
  marcelo = await createStaff("marcelo");
  comercial = await createStaff("comercial");
  financeiro = await createStaff("financeiro");
  rh = await createStaff("rh");

  cookieAdmin = await loginStaff(admin);
  cookieTi = await loginStaff(ti);
  cookieMarcelo = await loginStaff(marcelo);
  cookieComercial = await loginStaff(comercial);
  cookieFinanceiro = await loginStaff(financeiro);
  cookieRh = await loginStaff(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    server.kill("SIGKILL");
  }
  if (serverLogs.trim()) console.error(`SERVER_LOGS_TAIL_BEGIN\n${serverLogs.slice(-5000)}\nSERVER_LOGS_TAIL_END`);
});

const opt = { skip: !RUN };

// ---------------------------------------------------------------------------
// Suíte de Testes Ponta a Ponta EXT-09
// ---------------------------------------------------------------------------

test("EXT-09 cluster limpo não teve seed e responde lista vazia com critérios", opt, async () => {
  const counts = (
    await pool.query(
      `SELECT (SELECT count(*) FROM ext_expansion_plans WHERE origin='ext09_canonica') AS plans,
              (SELECT count(*) FROM ext_expansion_scenarios) AS scenarios,
              (SELECT count(*) FROM ext_expansion_events) AS events`
    )
  ).rows[0];
  assert.deepEqual(counts, { plans: "0", scenarios: "0", events: "0" });

  const list = await api("/api/ext/expansion/plans");
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 0);
  assert.equal(list.body.count, 0);
});

test("EXT-09 HTTP anônimo 401 em rotas de planos e cenários", opt, async () => {
  assert.equal((await api("/api/ext/expansion/plans", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/expansion/plans", { method: "POST", body: {}, cookie: null })).status, 401);
  assert.equal((await api(`/api/ext/expansion/plans/${randomUUID()}`, { cookie: null })).status, 401);
  assert.equal((await api(`/api/ext/expansion/plans/${randomUUID()}/scenarios`, { method: "POST", body: {}, cookie: null })).status, 401);
});

test("EXT-09 HTTP papel sem permissão de escrita (rh) recebe 403 na criação", opt, async () => {
  const r = await api("/api/ext/expansion/plans", {
    method: "POST",
    cookie: cookieRh,
    body: {
      title: "Plano RH Negado",
      description: "Descrição de tentativa de criação sem papel comercial/ti/admin.",
      premises: "Premissas negadas para teste.",
      target_location: "Sorocaba / SP",
    },
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "forbidden_role");
});

test("EXT-09 HTTP same-origin obrigatório em mutações", opt, async () => {
  const rGet = await api("/api/ext/expansion/plans", { origin: "https://attacker.invalid" });
  assert.equal(rGet.status, 200, "Leitura GET permite origin para exibição");

  const rPost = await api("/api/ext/expansion/plans", {
    method: "POST",
    origin: "https://attacker.invalid",
    body: {
      title: "Plano Origin Inválido",
      description: "Descrição para validação de same-origin check.",
      premises: "Premissas declaradas.",
      target_location: "Santos / SP",
    },
  });
  assert.equal(rPost.status, 403);
  assert.equal(rPost.body.error, "origin_forbidden");
});

test("EXT-09 HTTP Idempotency-Key obrigatória nas mutações", opt, async () => {
  const r = await api("/api/ext/expansion/plans", {
    method: "POST",
    key: null,
    body: {
      title: "Plano Sem Chave",
      description: "Descrição para validação de chave de idempotência obrigatória.",
      premises: "Premissas declaradas.",
      target_location: "Jundiaí / SP",
    },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "idempotency_key_required");
});

let testPlanId = null;

test("EXT-09 criação de plano de expansão por comercial inicia como rascunho com protocolo EXP-EXT", opt, async () => {
  const payload = {
    title: "Plano de Expansão Filial Campinas e Região Metropolitana",
    description: "Estruturação de nova base operacional para atendimento a condomínios e indústrias no eixo Campinas-Paulínia.",
    premises: "Custo baseado em locação de imóvel comercial central, contratação escalonada de 20 vigilantes e 2 viaturas dedicadas.",
    target_location: "Campinas / SP",
    capacity: 20,
    estimated_cost_cents: 8000000,
    estimated_revenue_cents: 12000000,
  };

  const r = await api("/api/ext/expansion/plans", { method: "POST", cookie: cookieComercial, body: payload });
  assert.equal(r.status, 201);
  assert.ok(r.body.plan?.id);
  assert.equal(r.body.plan.status, "rascunho");
  assert.equal(r.body.plan.is_estimate, true);
  assert.match(r.body.plan.protocol, /^EXP-EXT-\d{8}-[A-Z0-9]{4}$/);
  testPlanId = r.body.plan.id;

  // Verificar evento persistido
  const events = await pool.query(`SELECT * FROM ext_expansion_events WHERE plan_id = $1`, [testPlanId]);
  assert.equal(events.rows.length, 1);
  assert.equal(events.rows[0].event_type, "plano_criado");
});

test("EXT-09 detalhe do plano retorna campos, cenários, eventos e margem estimada", opt, async () => {
  const r = await api(`/api/ext/expansion/plans/${testPlanId}`, { cookie: cookieFinanceiro });
  assert.equal(r.status, 200);
  assert.equal(r.body.plan.id, testPlanId);
  assert.equal(Number(r.body.plan.estimated_margin_cents), 4000000); // 120k - 80k = 40k
  assert.ok(Array.isArray(r.body.plan.scenarios));
  assert.ok(Array.isArray(r.body.plan.events));
});

test("EXT-09 transições formais: rascunho -> em_analise -> aprovado -> em_execucao -> concluido", opt, async () => {
  // 1. Comercial submete para análise
  const r1 = await api(`/api/ext/expansion/plans/${testPlanId}/transition`, {
    method: "POST",
    cookie: cookieComercial,
    body: { status: "em_analise", notes: "Submetido à apreciação da diretoria" },
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.plan.status, "em_analise");

  // 2. Comercial tenta aprovar diretamente -> 403 (exige papel marcelo ou admin)
  const rFailApprove = await api(`/api/ext/expansion/plans/${testPlanId}/transition`, {
    method: "POST",
    cookie: cookieComercial,
    body: { status: "aprovado" },
  });
  assert.equal(rFailApprove.status, 403);
  assert.equal(rFailApprove.body.error, "approve_permission_required");

  // 3. Marcelo aprova formalmente
  const r2 = await api(`/api/ext/expansion/plans/${testPlanId}/transition`, {
    method: "POST",
    cookie: cookieMarcelo,
    body: { status: "aprovado", notes: "Plano aprovado conforme orçamento aprovado" },
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.plan.status, "aprovado");
  assert.ok(r2.body.plan.approved_at);

  // 4. Iniciar execução operacional (Admin)
  const r3 = await api(`/api/ext/expansion/plans/${testPlanId}/transition`, {
    method: "POST",
    cookie: cookieAdmin,
    body: { status: "em_execucao", notes: "Locação assinada e início do recrutamento" },
  });
  assert.equal(r3.status, 200);
  assert.equal(r3.body.plan.status, "em_execucao");

  // 5. Concluir implantação da filial (Admin)
  const r4 = await api(`/api/ext/expansion/plans/${testPlanId}/transition`, {
    method: "POST",
    cookie: cookieAdmin,
    body: { status: "concluido", notes: "Filial em plena operação" },
  });
  assert.equal(r4.status, 200);
  assert.equal(r4.body.plan.status, "concluido");
  assert.ok(r4.body.plan.completed_at);
});

test("EXT-09 rejeição ou cancelamento exige justificativa formal (mínimo 5 caracteres)", opt, async () => {
  // Criar um segundo plano para testar rejeição
  const rCreate = await api("/api/ext/expansion/plans", {
    method: "POST",
    cookie: cookieComercial,
    body: {
      title: "Plano Para Rejeição Sintética",
      description: "Descrição de plano que será rejeitado pela diretoria no teste.",
      premises: "Premissas de teste de rejeição.",
      target_location: "Taubaté / SP",
    },
  });
  assert.equal(rCreate.status, 201);
  const rejectPlanId = rCreate.body.plan.id;

  // Submeter para análise
  await api(`/api/ext/expansion/plans/${rejectPlanId}/transition`, {
    method: "POST",
    cookie: cookieComercial,
    body: { status: "em_analise" },
  });

  // Rejeitar sem justificativa -> 400
  const rRejectFail = await api(`/api/ext/expansion/plans/${rejectPlanId}/transition`, {
    method: "POST",
    cookie: cookieAdmin,
    body: { status: "rejeitado" },
  });
  assert.equal(rRejectFail.status, 400);
  assert.equal(rRejectFail.body.error, "justification_required");

  // Rejeitar com justificativa válida -> 200
  const rRejectOk = await api(`/api/ext/expansion/plans/${rejectPlanId}/transition`, {
    method: "POST",
    cookie: cookieAdmin,
    body: { status: "rejeitado", justification: "Inviabilidade financeira momentânea na praça" },
  });
  assert.equal(rRejectOk.status, 200);
  assert.equal(rRejectOk.body.plan.status, "rejeitado");
  assert.equal(rRejectOk.body.plan.justification, "Inviabilidade financeira momentânea na praça");
});

let testScenarioPlanId = null;
let testScenarioId = null;

test("EXT-09 adição de múltiplos cenários financeiros (A/B) calcula margem projetada e rejeita nome duplicado", opt, async () => {
  // Criar plano em rascunho
  const rCreate = await api("/api/ext/expansion/plans", {
    method: "POST",
    cookie: cookieComercial,
    body: {
      title: "Plano com Cenários Financeiros Simulados",
      description: "Planejamento com simulações conservadora e agressiva.",
      premises: "Premissas operacionais do cluster.",
      target_location: "Piracicaba / SP",
    },
  });
  assert.equal(rCreate.status, 201);
  testScenarioPlanId = rCreate.body.plan.id;

  // 1. Cenário Conservador
  const rScen1 = await api(`/api/ext/expansion/plans/${testScenarioPlanId}/scenarios`, {
    method: "POST",
    cookie: cookieComercial,
    body: {
      scenario_name: "Cenário Conservador",
      premises: "Premissas de 10 postos fechados nos primeiros 6 meses.",
      projected_cost_cents: 4000000,
      projected_revenue_cents: 5500000,
    },
  });
  assert.equal(rScen1.status, 201);
  assert.equal(Number(rScen1.body.scenario.projected_margin_cents), 1500000);
  testScenarioId = rScen1.body.scenario.id;

  // 2. Tentar adicionar mesmo nome de cenário -> 409
  const rScenDup = await api(`/api/ext/expansion/plans/${testScenarioPlanId}/scenarios`, {
    method: "POST",
    cookie: cookieComercial,
    body: {
      scenario_name: "Cenário Conservador",
      premises: "Outras premissas.",
      projected_cost_cents: 3000000,
      projected_revenue_cents: 4000000,
    },
  });
  assert.equal(rScenDup.status, 409);
  assert.equal(rScenDup.body.error, "scenario_name_duplicate");

  // 3. Cenário Otimista
  const rScen2 = await api(`/api/ext/expansion/plans/${testScenarioPlanId}/scenarios`, {
    method: "POST",
    cookie: cookieComercial,
    body: {
      scenario_name: "Cenário Otimista",
      premises: "Premissas de 25 postos com cliente âncora industrial.",
      projected_cost_cents: 7000000,
      projected_revenue_cents: 11000000,
    },
  });
  assert.equal(rScen2.status, 201);
  assert.equal(Number(rScen2.body.scenario.projected_margin_cents), 4000000);
});

test("EXT-09 exclusão de cenário financeiro em plano em rascunho", opt, async () => {
  const rDel = await api(`/api/ext/expansion/scenarios/${testScenarioId}`, {
    method: "DELETE",
    cookie: cookieComercial,
  });
  assert.equal(rDel.status, 200);
  assert.equal(rDel.body.deleted, true);

  // Verificar na base que o cenário foi excluído
  const check = await pool.query(`SELECT count(*)::int n FROM ext_expansion_scenarios WHERE id = $1`, [testScenarioId]);
  assert.equal(check.rows[0].n, 0);
});

test("EXT-09 busca e filtros por status e localidade", opt, async () => {
  const rSearch = await api("/api/ext/expansion/plans?location=Piracicaba", { cookie: cookieFinanceiro });
  assert.equal(rSearch.status, 200);
  assert.equal(rSearch.body.items.length, 1);
  assert.equal(rSearch.body.items[0].target_location, "Piracicaba / SP");
});

test("EXT-09 falha injetada de auditoria provoca rollback atômico e 503 audit_unavailable", opt, async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_fail_expansion_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action = 'expansion_plan_create_injected_fail' THEN
        RAISE EXCEPTION 'injected_expansion_audit_failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS qa_expansion_audit_trigger ON auth_access_audit;
    CREATE TRIGGER qa_expansion_audit_trigger BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_fail_expansion_audit();
  `);

  // Modificar temporariamente a action ou criar trigger que verifica se o título inserido corresponde
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_fail_expansion_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action = 'expansion_plan_create' AND EXISTS (SELECT 1 FROM ext_expansion_plans WHERE id::text = NEW.target AND title LIKE '%Trigger Falha%') THEN
        RAISE EXCEPTION 'injected_expansion_audit_failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  try {
    const rFail = await api("/api/ext/expansion/plans", {
      method: "POST",
      cookie: cookieComercial,
      body: {
        title: "Plano Trigger Falha Auditoria",
        description: "Descrição de plano para validação de rollback em caso de falha de auditoria.",
        premises: "Premissas do teste de auditoria.",
        target_location: "Localidade Falha",
      },
    });
    assert.equal(rFail.status, 503);
    assert.equal(rFail.body.error, "audit_unavailable");

    // Verificar rollback completo
    const checkDb = await pool.query(`SELECT count(*)::int n FROM ext_expansion_plans WHERE title = 'Plano Trigger Falha Auditoria'`);
    assert.equal(checkDb.rows[0].n, 0, "Plano não pode persistir após falha de auditoria");
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_expansion_audit_trigger ON auth_access_audit;`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_fail_expansion_audit();`);
  }
});

test("EXT-09 rotas legadas mantêm leitura compatível e respondem 410 na escrita", opt, async () => {
  // GET legados
  const rGetPlans = await api("/api/ext/expansion-plans", { cookie: cookieAdmin });
  assert.equal(rGetPlans.status, 200);
  assert.ok(Array.isArray(rGetPlans.body.items));

  const rGetScen = await api("/api/ext/expansion-scenarios", { cookie: cookieAdmin });
  assert.equal(rGetScen.status, 200);
  assert.ok(Array.isArray(rGetScen.body.items));

  // POST legados -> 410
  const rPostPlans = await api("/api/ext/expansion-plans", {
    method: "POST",
    cookie: cookieAdmin,
    body: { title: "Tentativa legada" },
  });
  assert.equal(rPostPlans.status, 410);
  assert.equal(rPostPlans.body.error, "legacy_expansion_writer_retired");

  const rPostScen = await api("/api/ext/expansion-scenarios", {
    method: "POST",
    cookie: cookieAdmin,
    body: { scenario_name: "Tentativa legada" },
  });
  assert.equal(rPostScen.status, 410);
  assert.equal(rPostScen.body.error, "legacy_expansion_writer_retired");
});

test("EXT-09 UI /admin/expansao responde 200 e componente React ExpansionWorkspace está presente", opt, async () => {
  await access(path.join(root, "src/app/admin/expansao/ExpansionWorkspace.tsx"));
  await access(path.join(root, "src/app/admin/expansao/page.tsx"));

  const res = await fetch(`${base}/admin/expansao`, {
    headers: { cookie: cookieComercial },
    signal: AbortSignal.timeout(30000),
  });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Expansão|expansao|Novas Unidades/i);
});
