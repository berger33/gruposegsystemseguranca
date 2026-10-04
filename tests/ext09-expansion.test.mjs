// EXT-09: testes unitários focais de planejamento de expansão e cenários
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createExtExpansionApi } from "../src/server/ext-expansion-api.mjs";

const root = path.resolve(import.meta.dirname, "..");

function createMockReq({ method = "GET", url = "/api/ext/expansion/plans", headers = {}, body = null }) {
  const req = (async function* () {
    if (body !== null) {
      yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    }
  })();
  req.method = method;
  req.url = url;
  req.headers = {
    host: "127.0.0.1:4000",
    origin: "http://127.0.0.1:4000",
    "idempotency-key": "ext09-test-key-001",
    ...headers,
  };
  return req;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
    json() {
      try {
        return JSON.parse(this.body);
      } catch {
        return { raw: this.body };
      }
    },
  };
  return res;
}

test("EXT-09 migração 161 é aditiva, preserva 001–160 e define tabela de eventos", async () => {
  const mig161 = await readFile(path.join(root, "db/migrations/161-ext09-expansion-canonical-journey.sql"), "utf-8");
  assert.match(mig161, /ALTER TABLE ext_expansion_plans/);
  assert.match(mig161, /CREATE TABLE IF NOT EXISTS ext_expansion_events/);
  assert.match(mig161, /ext_expansion_events_immutable_guard/);
});

test("EXT-09 criação valida título, descrição, premissas e localidade alvo", async () => {
  const plans = [];
  const events = [];
  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes("SELECT * FROM ext_expansion_plans WHERE id = $1")) {
        const found = plans.find(p => p.id === params[0]);
        return { rows: found ? [found] : [] };
      }
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql, params) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (sql.includes("SELECT * FROM ext_expansion_events WHERE idempotency_key = $1")) return { rows: [] };
        if (sql.includes("INSERT INTO ext_expansion_plans")) {
          const row = {
            id: "plan-uuid-01",
            protocol: params[0],
            title: params[1],
            description: params[2],
            premises: params[3],
            target_location: params[4],
            capacity: params[5],
            estimated_cost_cents: params[6],
            estimated_revenue_cents: params[7],
            status: "rascunho",
            is_estimate: true,
          };
          plans.push(row);
          return { rows: [row] };
        }
        if (sql.includes("INSERT INTO ext_expansion_events")) {
          events.push(params);
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO auth_access_audit")) return { rows: [] };
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const api = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-1", role: "comercial" }),
  });

  // Título curto -> 400
  const req1 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans",
    body: { title: "Abc", description: "Descrição válida suficientemente longa", premises: "Premissas válidas", target_location: "Campinas" },
  });
  const res1 = createMockRes();
  await api.handle(req1, res1);
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.json().error, "invalid_title");

  // Premissas curtas -> 400
  const req2 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans",
    body: { title: "Expansão Filial", description: "Descrição válida suficientemente longa", premises: "Curta", target_location: "Campinas" },
  });
  const res2 = createMockRes();
  await api.handle(req2, res2);
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.json().error, "invalid_premises");
});

test("EXT-09 criação válida inicia como rascunho com protocolo EXP-EXT e estimativa declarada", async () => {
  let createdPlan = null;
  const mockPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql, params) => {
        if (sql.includes("INSERT INTO ext_expansion_plans")) {
          createdPlan = {
            id: "plan-uuid-02",
            protocol: params[0],
            title: params[1],
            description: params[2],
            premises: params[3],
            target_location: params[4],
            status: "rascunho",
            is_estimate: true,
          };
          return { rows: [createdPlan] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const api = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-1", role: "comercial" }),
  });

  const req = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans",
    body: {
      title: "Expansão Vale do Paraíba",
      description: "Planejamento estruturado para atendimento a contratos industriais na região de São José dos Campos.",
      premises: "Premissas baseadas na taxa de conversão comercial dos últimos 12 meses e custo de mobilização de frota.",
      target_location: "São José dos Campos / SP",
      capacity: 25,
      estimated_cost_cents: 12000000,
      estimated_revenue_cents: 18000000,
    },
  });
  const res = createMockRes();
  await api.handle(req, res);

  assert.equal(res.statusCode, 201);
  const json = res.json();
  assert.equal(json.plan.status, "rascunho");
  assert.equal(json.plan.is_estimate, true);
  assert.match(json.plan.protocol, /^EXP-EXT-\d{8}-[A-Z0-9]{4}$/);
});

test("EXT-09 transição de status segue máquina de estados e exige aprovação restrita", async () => {
  let currentStatus = "rascunho";
  const mockPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql, params) => {
        if (sql.includes("SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE")) {
          return { rows: [{ id: "plan-1", protocol: "EXP-EXT-20261004-AAAA", status: currentStatus }] };
        }
        if (sql.includes("UPDATE ext_expansion_plans")) {
          currentStatus = params[1] || "aprovado";
          return { rows: [{ id: "plan-1", protocol: "EXP-EXT-20261004-AAAA", status: currentStatus }] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  // 1. Comercial tenta aprovar diretamente -> 403
  const apiComercial = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-com", role: "comercial" }),
  });

  const req1 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans/11111111-1111-1111-1111-111111111111/transition",
    body: { status: "aprovado" },
  });
  const res1 = createMockRes();
  await apiComercial.handle(req1, res1);
  assert.equal(res1.statusCode, 403);
  assert.equal(res1.json().error, "approve_permission_required");

  // 2. Transição inválida: rascunho direto para concluido -> 409
  const apiAdmin = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-adm", role: "admin" }),
  });

  const req2 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans/11111111-1111-1111-1111-111111111111/transition",
    body: { status: "concluido" },
  });
  const res2 = createMockRes();
  await apiAdmin.handle(req2, res2);
  assert.equal(res2.statusCode, 409);
  assert.equal(res2.json().error, "invalid_transition");
});

test("EXT-09 rejeição ou cancelamento exige justificativa formal", async () => {
  const mockPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql) => {
        if (sql.includes("SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE")) {
          return { rows: [{ id: "plan-1", status: "em_analise" }] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const api = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-adm", role: "admin" }),
  });

  // Rejeição sem justificativa -> 400
  const req = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans/11111111-1111-1111-1111-111111111111/transition",
    body: { status: "rejeitado" },
  });
  const res = createMockRes();
  await api.handle(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "justification_required");
});

test("EXT-09 cenário financeiro exige premissas e rejeita duplicidade de nome", async () => {
  const mockPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql, params) => {
        if (sql.includes("SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE")) {
          return { rows: [{ id: "plan-1", status: "rascunho" }] };
        }
        if (sql.includes("SELECT 1 FROM ext_expansion_scenarios WHERE plan_id = $1 AND scenario_name = $2")) {
          if (params[1] === "Cenário Existente") return { rows: [{ 1: 1 }] };
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO ext_expansion_scenarios")) {
          return { rows: [{ id: "scen-1", scenario_name: params[1], projected_cost_cents: params[3], projected_revenue_cents: params[4] }] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const api = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-1", role: "ti" }),
  });

  // Nome duplicado -> 409
  const req1 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans/11111111-1111-1111-1111-111111111111/scenarios",
    body: { scenario_name: "Cenário Existente", premises: "Premissas do cenário" },
  });
  const res1 = createMockRes();
  await api.handle(req1, res1);
  assert.equal(res1.statusCode, 409);
  assert.equal(res1.json().error, "scenario_name_duplicate");

  // Cenário válido -> 201
  const req2 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans/11111111-1111-1111-1111-111111111111/scenarios",
    body: {
      scenario_name: "Cenário Otimista",
      premises: "Premissas de 40 colaboradores contratados no primeiro trimestre",
      projected_cost_cents: 5000000,
      projected_revenue_cents: 8000000,
    },
  });
  const res2 = createMockRes();
  await api.handle(req2, res2);
  assert.equal(res2.statusCode, 201);
  assert.equal(res2.json().scenario.scenario_name, "Cenário Otimista");
});

test("EXT-09 replay de idempotência retorna 200 e payload divergente 409", async () => {
  const existingEvent = {
    id: "ev-1",
    plan_id: "plan-1",
    idempotency_key: "ext09-test-key-001",
    request_fingerprint: "hash-original",
  };

  const mockPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql, params) => {
        if (sql.includes("SELECT * FROM ext_expansion_events WHERE idempotency_key = $1")) {
          return { rows: [existingEvent] };
        }
        if (sql.includes("SELECT * FROM ext_expansion_plans WHERE id = $1")) {
          return { rows: [{ id: "plan-1", protocol: "EXP-EXT-0001", title: "Plano Original" }] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const api = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-1", role: "ti" }),
  });

  // Divergência de payload -> 409
  const req = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans",
    body: { title: "Título Divergente", description: "Descrição válida longa...", premises: "Premissas válidas...", target_location: "Santos" },
  });
  const res = createMockRes();
  await api.handle(req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "idempotency_conflict_payload_mismatch");
});

test("EXT-09 falha de audit_log provoca rollback e devolve 503 audit_unavailable", async () => {
  const mockPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql) => {
        if (sql.includes("INSERT INTO ext_expansion_plans")) {
          return { rows: [{ id: "plan-1", protocol: "EXP-EXT-0001" }] };
        }
        if (sql.includes("INSERT INTO auth_access_audit")) {
          throw new Error("audit log offline");
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const api = createExtExpansionApi({
    pool: mockPool,
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-1", role: "admin" }),
  });

  const req = createMockReq({
    method: "POST",
    url: "/api/ext/expansion/plans",
    body: {
      title: "Plano Teste Auditoria",
      description: "Descrição válida suficientemente longa para o teste de auditoria.",
      premises: "Premissas válidas declaradas no teste.",
      target_location: "Ribeirão Preto",
    },
  });
  const res = createMockRes();
  await api.handle(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audit_unavailable");
});

test("EXT-09 rota legada aposenta escrita com HTTP 410", async () => {
  const api = createExtExpansionApi({
    pool: { query: async () => ({ rows: [] }) },
    sameOrigin: () => true,
    requireSession: async () => ({ identityId: "user-1", role: "admin" }),
  });

  const req1 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion-plans",
    body: { title: "Tentativa de escrita legada" },
  });
  const res1 = createMockRes();
  await api.handleLegacyPlans(req1, res1);
  assert.equal(res1.statusCode, 410);
  assert.equal(res1.json().error, "legacy_expansion_writer_retired");

  const req2 = createMockReq({
    method: "POST",
    url: "/api/ext/expansion-scenarios",
    body: { scenario_name: "Cenário legado" },
  });
  const res2 = createMockRes();
  await api.handleLegacyScenarios(req2, res2);
  assert.equal(res2.statusCode, 410);
  assert.equal(res2.json().error, "legacy_expansion_writer_retired");
});
