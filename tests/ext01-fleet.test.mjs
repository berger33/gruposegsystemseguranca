import assert from "node:assert/strict";
import { test } from "node:test";
import { createExtFleetApi, deriveMaintenanceAlert, FLEET_SOURCES } from "../src/server/ext-fleet-api.mjs";

const identityId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "11111111-1111-4111-8111-111111111111";
const docId = "33333333-3333-4333-8333-333333333333";

const vehicleRow = {
  id: vehicleId, plate: "ABC1D23", model: "Fiorino Furgão", manufacturer: "Fiat", year: 2022,
  fuel_type: "flex", status: "disponivel", responsible_name: null, mileage: 10000,
  last_maintenance_date: null, next_maintenance_date: null, cost_center: null, notes: null,
  origin: "jornada_frota", created_by_identity: identityId, created_at: "now", updated_at: "now",
};

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = "/api/ext/fleet/vehicles", body, key = "ext01-test-key-0001" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "admin.test", origin: "https://admin.test" };
  if (key !== null) headers["idempotency-key"] = key;
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}

function api(pool, { session = { identityId, role: "admin" }, origin = true } = {}) {
  return createExtFleetApi({
    pool,
    sameOrigin: () => origin,
    requireSession: async () => session,
  });
}

function readPool(routes = []) {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      for (const [needle, rows] of routes) {
        if (sql.includes(needle)) return { rows };
      }
      return { rows: [] };
    },
  };
  return { statements, pool };
}

function mutationPool({ replayRow = null, vehicle = vehicleRow, failAudit = false } = {}) {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (failAudit && sql.includes("INSERT INTO audit_log")) throw new Error("audit offline");
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: replayRow ? [replayRow] : [] };
      if (sql.includes("FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE")) return { rows: vehicle ? [{ ...vehicle }] : [] };
      if (sql.includes("SELECT id FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE")) return { rows: vehicle ? [{ id: vehicle.id }] : [] };
      if (sql.includes("SELECT * FROM ext_fleet_vehicles WHERE id=$1")) return { rows: vehicle ? [{ ...vehicle }] : [] };
      if (sql.includes("INSERT INTO ext_fleet_vehicles")) {
        return { rows: [{ ...vehicleRow, id: params[0], plate: params[1], model: params[2], created_by_identity: params[9] }] };
      }
      if (sql.includes("INSERT INTO ext_fleet_fuel_logs")) {
        return { rows: [{ id: "fuel-1", vehicle_id: params[0], fuel_date: params[1], liters: params[2], cost_cents: params[3], mileage: params[4], station: params[5], created_by_identity: params[6] }] };
      }
      if (sql.includes("INSERT INTO ext_fleet_maintenance_logs")) {
        return { rows: [{ id: "maint-1", vehicle_id: params[0], maintenance_type: params[1], performed_at: params[5], next_due_date: params[6], created_by_identity: params[7] }] };
      }
      if (sql.includes("INSERT INTO ext_fleet_documents")) {
        return { rows: [{ id: docId, vehicle_id: params[0], document_type: params[1], is_active: true }] };
      }
      if (sql.includes("INSERT INTO ext_fleet_maintenance_rules")) {
        return { rows: [{ id: "rule-1", vehicle_id: params[0], interval_days: params[1], interval_km: params[2], is_active: true }] };
      }
      if (sql.includes("UPDATE ext_fleet_vehicles SET")) return { rows: [{ ...vehicleRow, status: "em_uso" }] };
      return { rows: [] };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

function sqlIndex(statements, needle) {
  return statements.findIndex(s => s.sql.includes(needle));
}

// ---------------------------------------------------------------------------
// Autorização: anônimo 401, papel não autorizado 403, antes de qualquer query.
// ---------------------------------------------------------------------------

test("EXT-01: anônimo recebe 401 sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const handler = api(pool, { session: null });
  const res = responseCapture();
  await handler.handleVehicles(request({}), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "unauthorized");
  assert.equal(statements.length, 0);
});

test("EXT-01: papel staff não autorizado (rh) recebe 403 sem tocar o banco", async () => {
  const { statements, pool } = readPool();
  const handler = api(pool, { session: { identityId, role: "rh" } });
  const res = responseCapture();
  await handler.handleVehicles(request({}), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "forbidden_role");
  assert.equal(statements.length, 0);
});

test("EXT-01: mutação exige same-origin antes de qualquer query", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool, { origin: false });
  const res = responseCapture();
  await handler.handleVehicles(request({ method: "POST", body: { plate: "ABC1D23", model: "Fiorino Furgão" } }), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "origin_forbidden");
  assert.equal(statements.length, 0);
});

// ---------------------------------------------------------------------------
// "Se frota própria existir": ausência declarada, com fonte e data-base.
// ---------------------------------------------------------------------------

test("EXT-01: sem registro canônico, a listagem declara a ausência com fonte e data-base (nada inventado)", async () => {
  const { pool } = readPool([["FROM ext_fleet_vehicles", []]]);
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicles(request({}), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.fleet_registered, false);
  assert.deepEqual(res.payload.vehicles, []);
  assert.equal(res.payload.source, FLEET_SOURCES.vehicles);
  assert.ok(res.payload.base_date, "data-base declarada");
  assert.match(res.payload.note, /Nenhum registro canônico de frota/);
});

// ---------------------------------------------------------------------------
// Idempotência: chave obrigatória, replay sem duplicar, reuso divergente 409.
// ---------------------------------------------------------------------------

test("EXT-01: POST sem Idempotency-Key responde 400 sem escrever", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicles(request({ method: "POST", body: { plate: "ABC1D23", model: "Fiorino Furgão" }, key: null }), res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "idempotency_key_required");
  assert.equal(statements.length, 0);
});

test("EXT-01: criação de veículo é transação única (negócio + evento imutável + audit_log) com autoria da sessão; corpo forjado é ignorado", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicles(request({
    method: "POST",
    body: {
      plate: "abc1d23", model: "Fiorino Furgão", manufacturer: "Fiat", year: 2022, mileage: 10000,
      // Campos forjados: devem ser ignorados pelo servidor.
      id: "99999999-9999-4999-8999-999999999999",
      created_by_identity: "99999999-9999-4999-8999-999999999999",
      responsible_identity: "99999999-9999-4999-8999-999999999999",
      origin: "registro_legado",
    },
  }), res);
  assert.equal(res.status, 201);
  assert.equal(res.payload.vehicle.plate, "ABC1D23", "placa normalizada no servidor");

  const begin = sqlIndex(statements, "BEGIN");
  const insertVehicle = sqlIndex(statements, "INSERT INTO ext_fleet_vehicles");
  const insertEvent = sqlIndex(statements, "INSERT INTO ext_fleet_vehicle_events");
  const insertAudit = sqlIndex(statements, "INSERT INTO audit_log");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(begin >= 0 && begin < insertVehicle && insertVehicle < insertEvent && insertEvent < insertAudit && insertAudit < commit,
    "ordem: BEGIN → veículo → evento → auditoria → COMMIT");

  const vehicleParams = statements[insertVehicle].params;
  assert.notEqual(vehicleParams[0], "99999999-9999-4999-8999-999999999999", "ID gerado no servidor, não do corpo");
  assert.equal(vehicleParams[9], identityId, "autoria derivada da sessão, não do corpo");
  assert.ok(statements[insertVehicle].sql.includes("'jornada_frota'"), "origem fixada pelo servidor");
  assert.equal(statements[insertAudit].params[0], "ext_fleet_vehicle_create");
  assert.equal(statements[insertAudit].params[1], identityId);
});

test("EXT-01: retry idêntico não duplica — replay devolve o mesmo veículo", async () => {
  const fingerprint = null; // calculado abaixo a partir do mesmo corpo
  const body = { plate: "ABC1D23", model: "Fiorino Furgão" };
  // Primeiro, captura o fingerprint real gravado numa criação normal.
  const first = mutationPool();
  await api(first.pool).handleVehicles(request({ method: "POST", body }), responseCapture());
  const eventInsert = first.statements[sqlIndex(first.statements, "INSERT INTO ext_fleet_vehicle_events")];
  const storedFingerprint = eventInsert.params[5];
  assert.match(String(storedFingerprint), /^[0-9a-f]{64}$/);

  const replay = mutationPool({ replayRow: { vehicle_id: vehicleId, request_fingerprint: storedFingerprint, payload: {} } });
  const res = responseCapture();
  await api(replay.pool).handleVehicles(request({ method: "POST", body }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.payload.vehicle.id, vehicleId);
  assert.equal(sqlIndex(replay.statements, "INSERT INTO ext_fleet_vehicles"), -1, "nenhuma segunda criação");
  assert.equal(sqlIndex(replay.statements, "INSERT INTO audit_log"), -1, "replay não regrava auditoria");
  assert.ok(fingerprint === null);
});

test("EXT-01: reuso da chave com conteúdo divergente responde 409 e reverte", async () => {
  const { statements, pool } = mutationPool({ replayRow: { vehicle_id: vehicleId, request_fingerprint: "a".repeat(64), payload: {} } });
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicles(request({ method: "POST", body: { plate: "XYZ9Z99", model: "Outro modelo divergente" } }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "idempotency_key_reused");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "INSERT INTO ext_fleet_vehicles"), -1);
});

// ---------------------------------------------------------------------------
// Auditoria obrigatória: indisponível → 503 com rollback, nada persiste.
// ---------------------------------------------------------------------------

test("EXT-01: falha da auditoria devolve 503 audit_unavailable com rollback (sem COMMIT)", async () => {
  const { statements, pool } = mutationPool({ failAudit: true });
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicles(request({ method: "POST", body: { plate: "ABC1D23", model: "Fiorino Furgão" } }), res);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_unavailable");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0, "rollback emitido");
  assert.equal(sqlIndex(statements, "COMMIT"), -1, "nenhum COMMIT após falha da auditoria");
});

// ---------------------------------------------------------------------------
// Vínculos derivados da URL/sessão; corpo não vincula.
// ---------------------------------------------------------------------------

test("EXT-01: abastecimento vincula o veículo pela URL; vehicle_id forjado no corpo é ignorado e km só avança", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicleFuelLogs(request({
    method: "POST",
    url: `/api/ext/fleet/vehicles/${vehicleId}/fuel-logs`,
    body: { vehicle_id: "99999999-9999-4999-8999-999999999999", fuel_date: "2026-10-01", liters: 40, cost_cents: 24000, mileage: 10500 },
  }), res, vehicleId);
  assert.equal(res.status, 201);
  const insertFuel = statements[sqlIndex(statements, "INSERT INTO ext_fleet_fuel_logs")];
  assert.equal(insertFuel.params[0], vehicleId, "vínculo do veículo vem da URL");
  assert.equal(insertFuel.params[6], identityId, "autoria derivada da sessão");
  const mileageUpdate = sqlIndex(statements, "UPDATE ext_fleet_vehicles SET mileage");
  assert.ok(mileageUpdate >= 0 && mileageUpdate < sqlIndex(statements, "COMMIT"), "km do veículo atualizado na mesma transação");
});

test("EXT-01: abastecimento em veículo inexistente responde 404 com rollback", async () => {
  const { statements, pool } = mutationPool({ vehicle: null });
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicleFuelLogs(request({
    method: "POST",
    url: `/api/ext/fleet/vehicles/${vehicleId}/fuel-logs`,
    body: { fuel_date: "2026-10-01", liters: 40, cost_cents: 24000 },
  }), res, vehicleId);
  assert.equal(res.status, 404);
  assert.equal(res.payload.error, "vehicle_not_found");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "INSERT INTO ext_fleet_fuel_logs"), -1);
});

test("EXT-01: abastecimento com data futura é recusado (nada é inventado)", async () => {
  const { pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  const future = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  await handler.handleVehicleFuelLogs(request({
    method: "POST",
    url: `/api/ext/fleet/vehicles/${vehicleId}/fuel-logs`,
    body: { fuel_date: future, liters: 40, cost_cents: 24000 },
  }), res, vehicleId);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "fuel_date_in_future");
});

test("EXT-01: manutenção atualiza last/next do veículo na MESMA transação do registro e da auditoria", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicleMaintenanceLogs(request({
    method: "POST",
    url: `/api/ext/fleet/vehicles/${vehicleId}/maintenance-logs`,
    body: { maintenance_type: "preventiva", description: "Troca de óleo e filtros conforme plano.", cost_cents: 45000, performed_at: "2026-09-20", next_due_date: "2027-03-20" },
  }), res, vehicleId);
  assert.equal(res.status, 201);
  const begin = sqlIndex(statements, "BEGIN");
  const insertLog = sqlIndex(statements, "INSERT INTO ext_fleet_maintenance_logs");
  const updateVehicle = sqlIndex(statements, "UPDATE ext_fleet_vehicles SET last_maintenance_date");
  const insertAudit = sqlIndex(statements, "INSERT INTO audit_log");
  const commit = sqlIndex(statements, "COMMIT");
  assert.ok(begin < insertLog && insertLog < updateVehicle && updateVehicle < insertAudit && insertAudit < commit,
    "registro, atualização do veículo e auditoria na mesma transação");
});

test("EXT-01: quilometragem canônica não regride via PATCH", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicleById(request({ method: "PATCH", url: `/api/ext/fleet/vehicles/${vehicleId}`, body: { mileage: 500 } }), res, vehicleId);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "mileage_regression");
  assert.ok(sqlIndex(statements, "ROLLBACK") >= 0);
  assert.equal(sqlIndex(statements, "UPDATE ext_fleet_vehicles SET"), -1);
});

// ---------------------------------------------------------------------------
// Histórico imutável na superfície da API: logs não aceitam UPDATE/DELETE.
// (No banco, a migração 147 também instala triggers de imutabilidade.)
// ---------------------------------------------------------------------------

test("EXT-01: logs são apenas-acréscimo na API — PUT/DELETE respondem 405", async () => {
  const { pool } = mutationPool();
  const handler = api(pool);
  for (const method of ["PUT", "DELETE"]) {
    const res = responseCapture();
    await handler.handleVehicleFuelLogs(request({ method, url: `/api/ext/fleet/vehicles/${vehicleId}/fuel-logs` }), res, vehicleId);
    assert.equal(res.status, 405, `${method} em fuel-logs`);
    const res2 = responseCapture();
    await handler.handleVehicleMaintenanceLogs(request({ method, url: `/api/ext/fleet/vehicles/${vehicleId}/maintenance-logs` }), res2, vehicleId);
    assert.equal(res2.status, 405, `${method} em maintenance-logs`);
  }
});

// ---------------------------------------------------------------------------
// Dossiê: custo somente de registros canônicos, com fonte e data-base; alerta
// derivado apenas de regra explícita.
// ---------------------------------------------------------------------------

test("EXT-01: dossiê soma custo apenas dos registros canônicos e declara fonte/data-base; sem regra o alerta declara 'sem_regra'", async () => {
  const { pool } = readPool([
    ["FROM ext_fleet_maintenance_logs WHERE vehicle_id=$1 ORDER BY performed_at DESC, created_at DESC LIMIT 1", []],
    ["SELECT * FROM ext_fleet_vehicles WHERE id=$1", [vehicleRow]],
    ["FROM ext_fleet_fuel_logs", [{ id: "f1", fuel_date: "2026-09-01", liters: "40.00", cost_cents: "24000" }, { id: "f2", fuel_date: "2026-09-15", liters: "35.00", cost_cents: "21000" }]],
    ["FROM ext_fleet_maintenance_logs", [{ id: "m1", maintenance_type: "corretiva", cost_cents: "90000", performed_at: "2026-08-10" }]],
    ["FROM ext_fleet_maintenance_rules", []],
  ]);
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleVehicleById(request({ url: `/api/ext/fleet/vehicles/${vehicleId}` }), res, vehicleId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.cost.fuel_cost_cents, 45000);
  assert.equal(res.payload.cost.maintenance_cost_cents, 90000);
  assert.equal(res.payload.cost.total_cents, 135000);
  assert.deepEqual(res.payload.cost.source, [FLEET_SOURCES.fuel, FLEET_SOURCES.maintenance]);
  assert.ok(res.payload.cost.base_date, "data-base do custo declarada");
  assert.equal(res.payload.maintenance_alert.status, "sem_regra");
  assert.match(res.payload.maintenance_alert.message, /alerta não é inferido/);
});

test("EXT-01: alerta deriva somente da regra explícita e da base canônica (em_dia/alerta/vencida/sem_base)", () => {
  const rule = { id: "r1", interval_days: 180, interval_km: 10000, alert_before_days: 15, alert_before_km: 500, justification: "Plano da montadora." };

  // Sem regra: ausência declarada.
  assert.equal(deriveMaintenanceAlert({ rule: null, lastMaintenance: null, vehicleMileage: 0 }).status, "sem_regra");

  // Regra sem base canônica: sem_base, nunca estimado.
  const semBase = deriveMaintenanceAlert({ rule, lastMaintenance: null, vehicleMileage: 5000, today: "2026-10-03" });
  assert.equal(semBase.status, "sem_base");
  assert.ok(semBase.components.every(c => c.status === "sem_base"));

  // Em dia: manutenção recente e km longe do limite.
  const emDia = deriveMaintenanceAlert({
    rule, lastMaintenance: { performed_at: "2026-09-20", mileage: 10000 }, vehicleMileage: 10100, today: "2026-10-03",
  });
  assert.equal(emDia.status, "em_dia");

  // Alerta por dias: dentro da janela de antecedência declarada na regra.
  const alerta = deriveMaintenanceAlert({
    rule: { ...rule, interval_km: null }, lastMaintenance: { performed_at: "2026-04-10", mileage: null }, vehicleMileage: 0, today: "2026-10-03",
  });
  assert.equal(alerta.status, "alerta");
  assert.equal(alerta.components[0].due_date, "2026-10-07");

  // Vencida por km: quilometragem atual já passou do limite da regra.
  const vencida = deriveMaintenanceAlert({
    rule: { ...rule, interval_days: null }, lastMaintenance: { performed_at: "2026-01-10", mileage: 10000 }, vehicleMileage: 20500, today: "2026-10-03",
  });
  assert.equal(vencida.status, "vencida");
  assert.equal(vencida.components[0].remaining_km, -500);

  // A derivação declara a regra e a fonte.
  assert.equal(vencida.rule.id, "r1");
  assert.match(vencida.source, /ext_fleet_maintenance_rules/);
});

// ---------------------------------------------------------------------------
// Rota legada não é atalho: mutação aposentada com ponteiro para a canônica.
// ---------------------------------------------------------------------------

test("EXT-01: mutação na rota legada responde 410 com a rota canônica declarada", async () => {
  const { statements, pool } = mutationPool();
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleLegacyVehicles(request({ method: "POST", body: { plate: "ABC1D23", model: "Fiorino" } }), res);
  assert.equal(res.status, 410);
  assert.equal(res.payload.error, "legacy_route_retired");
  assert.equal(res.payload.use, "/api/ext/fleet/vehicles");
  assert.equal(statements.length, 0);

  const resFuel = responseCapture();
  await handler.handleLegacyFuelLogs(request({ method: "POST", url: "/api/ext/fleet-fuel-logs", body: {} }), resFuel);
  assert.equal(resFuel.status, 410);
  assert.equal(resFuel.payload.use, "/api/ext/fleet/vehicles/<id>/fuel-logs");
});

test("EXT-01: leitura legada exige papel autorizado e declara fonte", async () => {
  const { pool } = readPool([["FROM ext_fleet_fuel_logs", []]]);
  const denied = responseCapture();
  await api(pool, { session: { identityId, role: "comercial" } }).handleLegacyFuelLogs(request({ url: "/api/ext/fleet-fuel-logs" }), denied);
  assert.equal(denied.status, 403);

  const ok = responseCapture();
  await api(pool).handleLegacyFuelLogs(request({ url: "/api/ext/fleet-fuel-logs" }), ok);
  assert.equal(ok.status, 200);
  assert.equal(ok.payload.source, FLEET_SOURCES.fuel);
  assert.ok(ok.payload.base_date);
});

// ---------------------------------------------------------------------------
// Documento: desativação declarada com autor/motivo; nunca DELETE.
// ---------------------------------------------------------------------------

test("EXT-01: documento é desativado com motivo e autor derivado; DELETE responde 405", async () => {
  const docRow = { id: docId, vehicle_id: vehicleId, document_type: "CRLV", is_active: true };
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes("idempotency_key=$2 FOR UPDATE")) return { rows: [] };
      if (sql.includes("FROM ext_fleet_documents WHERE id=$1 FOR UPDATE")) return { rows: [docRow] };
      if (sql.includes("UPDATE ext_fleet_documents")) return { rows: [{ ...docRow, is_active: false, deactivate_reason: params[2] }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  const handler = api(pool);
  const res = responseCapture();
  await handler.handleDocumentById(request({ method: "PATCH", url: `/api/ext/fleet/documents/${docId}`, body: { reason: "Documento substituído pela renovação." } }), res, docId);
  assert.equal(res.status, 200);
  assert.equal(res.payload.document.is_active, false);
  const update = statements[sqlIndex(statements, "UPDATE ext_fleet_documents")];
  assert.equal(update.params[1], identityId, "autor da desativação derivado da sessão");
  assert.ok(sqlIndex(statements, "INSERT INTO ext_fleet_vehicle_events") >= 0, "evento imutável registrado");
  assert.ok(sqlIndex(statements, "INSERT INTO audit_log") >= 0, "auditoria na mesma transação");

  const resDelete = responseCapture();
  await handler.handleDocumentById(request({ method: "DELETE", url: `/api/ext/fleet/documents/${docId}` }), resDelete, docId);
  assert.equal(resDelete.status, 405);
});
