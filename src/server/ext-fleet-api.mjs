import { createHash, randomUUID } from "node:crypto";

// EXT-01: frota ligada ao backend canônico real — veículo, responsável,
// abastecimento, manutenção, documentos e custo, com histórico/custo por
// veículo e alerta de manutenção derivado de regra explícita registrada.
//
// Regras desta jornada (todas decididas no servidor, nunca no navegador):
// - somente sessão staff canônica autoriza; anônimo recebe 401 e papel não
//   autorizado recebe 403 antes de qualquer consulta;
// - autoria e vínculos são derivados da sessão e da URL; created_by_identity,
//   responsible_identity, vehicle_id em corpo e qualquer ID forjado no corpo
//   são ignorados;
// - a condição do plano é "se frota própria existir": sem registro canônico,
//   a resposta declara a ausência; nenhum veículo, custo ou histórico é
//   inventado ou estimado;
// - histórico/custo por veículo vem exclusivamente de ext_fleet_fuel_logs,
//   ext_fleet_maintenance_logs, ext_fleet_responsible_history e
//   ext_fleet_vehicle_events, com fonte e data-base declaradas na resposta;
// - alerta de manutenção deriva apenas de regra explícita registrada em
//   ext_fleet_maintenance_rules; sem regra ou sem base canônica, a ausência
//   é declarada, nunca estimada;
// - escrita, evento imutável e audit_log acontecem na MESMA transação; falha
//   da auditoria devolve 503 audit_unavailable com rollback;
// - toda mutação exige same-origin e Idempotency-Key: retry idêntico não
//   duplica (replay devolve o mesmo registro) e reuso divergente responde 409.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export const FLEET_READ_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const FLEET_WRITE_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const FUEL_TYPES = Object.freeze(["gasolina", "etanol", "diesel", "flex", "eletrico", "hibrido", "outro"]);
export const VEHICLE_STATUSES = Object.freeze(["disponivel", "em_uso", "em_manutencao", "baixado", "reservado"]);

export const FLEET_SOURCES = Object.freeze({
  vehicles: "ext_fleet_vehicles (migração 085, jornada 147)",
  fuel: "ext_fleet_fuel_logs (migração 085)",
  maintenance: "ext_fleet_maintenance_logs (migração 085)",
  documents: "ext_fleet_documents (migração 085, desativação 147)",
  responsible: "ext_fleet_responsible_history (migração 147)",
  events: "ext_fleet_vehicle_events (migração 147)",
  rules: "ext_fleet_maintenance_rules (migração 147)",
});

function fingerprintOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDaysIso(dateIso, days) {
  const base = new Date(`${dateIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// Projeção do veículo: colunas canônicas, sem sobra.
function vehicleProjection(row) {
  return {
    id: row.id,
    plate: row.plate,
    model: row.model,
    manufacturer: row.manufacturer,
    year: row.year,
    fuel_type: row.fuel_type,
    status: row.status,
    responsible_name: row.responsible_name,
    mileage: row.mileage,
    last_maintenance_date: dateOnly(row.last_maintenance_date),
    next_maintenance_date: dateOnly(row.next_maintenance_date),
    cost_center: row.cost_center,
    notes: row.notes,
    origin: row.origin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Alerta de manutenção: derivação determinística a partir da regra explícita
// registrada e da última manutenção canônica. Nada é estimado: sem regra ativa
// o status é 'sem_regra'; regra sem base canônica declara 'sem_base'.
export function deriveMaintenanceAlert({ rule, lastMaintenance, vehicleMileage, today = todayIso() }) {
  if (!rule) {
    return {
      status: "sem_regra",
      message: "Nenhuma regra de manutenção registrada para este veículo; alerta não é inferido.",
      source: FLEET_SOURCES.rules,
      base_date: today,
    };
  }
  const components = [];
  if (rule.interval_days != null) {
    if (!lastMaintenance?.performed_at) {
      components.push({
        kind: "dias",
        status: "sem_base",
        detail: "Regra por dias exige manutenção canônica registrada como base; nenhuma existe.",
      });
    } else {
      const base = dateOnly(lastMaintenance.performed_at);
      const dueDate = addDaysIso(base, rule.interval_days);
      const alertFrom = addDaysIso(dueDate, -rule.alert_before_days);
      const status = today >= dueDate ? "vencida" : today >= alertFrom ? "alerta" : "em_dia";
      components.push({ kind: "dias", status, base_performed_at: base, due_date: dueDate, alert_from: alertFrom });
    }
  }
  if (rule.interval_km != null) {
    const baseKm = lastMaintenance?.mileage;
    if (baseKm == null) {
      components.push({
        kind: "km",
        status: "sem_base",
        detail: "Regra por km exige manutenção canônica com quilometragem registrada como base; nenhuma existe.",
      });
    } else {
      const dueKm = Number(baseKm) + Number(rule.interval_km);
      const remainingKm = dueKm - Number(vehicleMileage ?? 0);
      const status = remainingKm <= 0 ? "vencida" : remainingKm <= rule.alert_before_km ? "alerta" : "em_dia";
      components.push({ kind: "km", status, base_mileage: Number(baseKm), due_mileage: dueKm, remaining_km: remainingKm });
    }
  }
  const rankOf = status => ({ vencida: 3, alerta: 2, sem_base: 1, em_dia: 0 })[status] ?? 0;
  const overall = components.reduce((acc, item) => (rankOf(item.status) > rankOf(acc) ? item.status : acc), "em_dia");
  return {
    status: overall,
    rule: {
      id: rule.id,
      interval_days: rule.interval_days,
      interval_km: rule.interval_km,
      alert_before_days: rule.alert_before_days,
      alert_before_km: rule.alert_before_km,
      justification: rule.justification,
    },
    components,
    source: `${FLEET_SOURCES.rules} + ${FLEET_SOURCES.maintenance}`,
    base_date: today,
  };
}

export function createExtFleetApi({ pool, sameOrigin, requireSession }) {
  function json(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  }

  const roleOf = sess => String(sess?.role || sess?.userRole || "").toLowerCase();

  // Autorização: anônimo 401; papel não autorizado 403; mutação exige
  // same-origin e identidade UUID real derivada da sessão.
  async function guard(req, res, { write = false } = {}) {
    let sess = null;
    try { sess = await requireSession(req); } catch { sess = null; }
    if (!sess) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = roleOf(sess);
    const allowed = write ? FLEET_WRITE_ROLES : FLEET_READ_ROLES;
    if (!allowed.includes(role)) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write) {
      if (!sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
      if (!UUID_PATTERN.test(String(sess.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    }
    return sess;
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32_768) return { tooLarge: true };
      chunks.push(chunk);
    }
    try {
      return { body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") };
    } catch {
      return { invalid: true };
    }
  }

  function idempotencyKeyOf(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return key;
  }

  // Toda mutação passa por aqui: BEGIN → replay por (identidade, chave) no
  // ledger de eventos → trabalho (negócio + evento imutável) → audit_log →
  // COMMIT. Falha da auditoria reverte tudo e devolve 503.
  async function runMutation(res, { session, key, fingerprint, audit, work, onReplay, onConflict }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const replay = await client.query(
        `SELECT * FROM ext_fleet_vehicle_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        const replayed = await onReplay(client, replay.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }

      const outcome = await work(client);
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return json(res, outcome.deny.code, outcome.deny.body);
      }

      try {
        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          [audit.action, session.identityId, outcome.auditTarget, JSON.stringify(outcome.auditMeta ?? {})],
        );
      } catch (auditError) {
        // Auditoria é obrigatória: indisponível → nada é persistido.
        await client.query("ROLLBACK");
        console.error("EXT-01 audit unavailable", auditError instanceof Error ? auditError.message : auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, outcome.code, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        // Corrida entre retries simultâneos da MESMA chave: devolve o replay.
        if (/idempotency/i.test(String(error.constraint || error.detail || ""))) {
          try {
            const raced = await client.query(
              `SELECT * FROM ext_fleet_vehicle_events WHERE created_by_identity=$1 AND idempotency_key=$2`,
              [session.identityId, key],
            );
            if (raced.rows[0]) {
              if (raced.rows[0].request_fingerprint !== fingerprint) return json(res, 409, { error: "idempotency_key_reused" });
              const replayed = await onReplay(client, raced.rows[0]);
              return json(res, 200, { ...replayed, replayed: true });
            }
          } catch {}
        }
        const handled = onConflict ? onConflict(error) : null;
        if (handled) return json(res, handled.code, handled.body);
      }
      console.error("EXT-01 mutation failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "fleet_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function insertEvent(client, { vehicleId, eventType, summary, payload, key, fingerprint, identityId }) {
    await client.query(
      `INSERT INTO ext_fleet_vehicle_events
         (vehicle_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [vehicleId, eventType, summary, JSON.stringify(payload ?? {}), key, fingerprint, identityId],
    );
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/fleet/vehicles
  // -------------------------------------------------------------------------
  async function handleVehicles(req, res) {
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const { rows } = await pool.query(
          `SELECT * FROM ext_fleet_vehicles ORDER BY plate ASC LIMIT 200`,
        );
        return json(res, 200, {
          vehicles: rows.map(vehicleProjection),
          fleet_registered: rows.length > 0,
          source: FLEET_SOURCES.vehicles,
          base_date: new Date().toISOString(),
          note: rows.length > 0
            ? "Frota própria registrada no backend canônico; histórico e custo por veículo vêm somente de registros canônicos."
            : "Nenhum registro canônico de frota própria. A condição do plano é 'se frota própria existir': nenhum veículo, custo ou histórico é inventado.",
        });
      } catch (error) {
        console.error("EXT-01 vehicles list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "fleet_unavailable" });
      }
    }
    if (req.method === "POST") {
      const session = await guard(req, res, { write: true });
      if (!session) return;
      const { body, tooLarge, invalid } = await readBody(req);
      if (tooLarge) return json(res, 413, { error: "body_too_large" });
      if (invalid) return json(res, 400, { error: "invalid_request" });

      // Somente o conteúdo do veículo vem do corpo; autoria/origem são do
      // servidor. created_by_identity/responsible_identity/origin forjados são ignorados.
      const plate = typeof body.plate === "string" ? body.plate.trim().toUpperCase() : "";
      const model = typeof body.model === "string" ? body.model.trim() : "";
      const manufacturer = typeof body.manufacturer === "string" && body.manufacturer.trim() ? body.manufacturer.trim() : null;
      const year = body.year == null || body.year === "" ? null : Number(body.year);
      const fuelType = typeof body.fuel_type === "string" && body.fuel_type ? body.fuel_type : "flex";
      const mileage = body.mileage == null || body.mileage === "" ? 0 : Number(body.mileage);
      const costCenter = typeof body.cost_center === "string" && body.cost_center.trim() ? body.cost_center.trim() : null;
      const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

      if (plate.length < 3 || plate.length > 20) return json(res, 400, { error: "invalid_plate" });
      if (model.length < 3 || model.length > 200) return json(res, 400, { error: "invalid_model" });
      if (manufacturer !== null && (manufacturer.length < 2 || manufacturer.length > 200)) return json(res, 400, { error: "invalid_manufacturer" });
      if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return json(res, 400, { error: "invalid_year" });
      if (!FUEL_TYPES.includes(fuelType)) return json(res, 400, { error: "invalid_fuel_type" });
      if (!Number.isInteger(mileage) || mileage < 0) return json(res, 400, { error: "invalid_mileage" });
      if (costCenter !== null && (costCenter.length < 3 || costCenter.length > 100)) return json(res, 400, { error: "invalid_cost_center" });
      if (notes !== null && (notes.length < 10 || notes.length > 1000)) return json(res, 400, { error: "invalid_notes" });

      const key = idempotencyKeyOf(req, res);
      if (!key) return;
      const fingerprint = fingerprintOf({ op: "vehicle_create", plate, model, manufacturer, year, fuelType, mileage, costCenter, notes });

      return runMutation(res, {
        session, key, fingerprint,
        audit: { action: "ext_fleet_vehicle_create" },
        onReplay: async (client, event) => {
          const { rows } = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1`, [event.vehicle_id]);
          return { vehicle: rows[0] ? vehicleProjection(rows[0]) : null };
        },
        onConflict: error => (/plate/i.test(String(error.constraint || error.detail || "")) ? { code: 409, body: { error: "duplicate_plate" } } : null),
        work: async client => {
          const vehicleId = randomUUID();
          const { rows } = await client.query(
            `INSERT INTO ext_fleet_vehicles
               (id, plate, model, manufacturer, year, fuel_type, mileage, cost_center, notes, origin, created_by_identity)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'jornada_frota',$10)
             RETURNING *`,
            [vehicleId, plate, model, manufacturer, year, fuelType, mileage, costCenter, notes, session.identityId],
          );
          await insertEvent(client, {
            vehicleId, eventType: "veiculo_criado",
            summary: `Veículo ${plate} criado pela jornada canônica de frota.`,
            payload: { plate, model }, key, fingerprint, identityId: session.identityId,
          });
          return {
            code: 201,
            body: { vehicle: vehicleProjection(rows[0]), note: "Veículo registrado no backend canônico; autoria derivada da sessão." },
            auditTarget: vehicleId,
            auditMeta: { plate },
          };
        },
      });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  // -------------------------------------------------------------------------
  // GET /api/ext/fleet/vehicles/<uuid> — dossiê: histórico/custo por veículo
  // PATCH — situação/quilometragem
  // -------------------------------------------------------------------------
  async function handleVehicleById(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const vehicle = await pool.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1`, [id]);
        if (!vehicle.rows[0]) return json(res, 404, { error: "vehicle_not_found" });
        const [fuel, maintenance, documents, responsible, events, ruleRows, lastMaintRows] = await Promise.all([
          pool.query(`SELECT id, fuel_date, liters, cost_cents, mileage, station, created_by_identity, created_at FROM ext_fleet_fuel_logs WHERE vehicle_id=$1 ORDER BY fuel_date DESC, created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, maintenance_type, description, cost_cents, mileage, performed_at, next_due_date, created_by_identity, created_at FROM ext_fleet_maintenance_logs WHERE vehicle_id=$1 ORDER BY performed_at DESC, created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, document_type, document_number, expiry_date, file_name, is_active, deactivated_at, deactivate_reason, created_at FROM ext_fleet_documents WHERE vehicle_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, previous_responsible_name, responsible_name, reason, assigned_by_identity, assigned_at FROM ext_fleet_responsible_history WHERE vehicle_id=$1 ORDER BY assigned_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT id, event_type, summary, payload, created_by_identity, created_at FROM ext_fleet_vehicle_events WHERE vehicle_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
          pool.query(`SELECT * FROM ext_fleet_maintenance_rules WHERE vehicle_id=$1 AND is_active LIMIT 1`, [id]),
          pool.query(`SELECT performed_at, mileage FROM ext_fleet_maintenance_logs WHERE vehicle_id=$1 ORDER BY performed_at DESC, created_at DESC LIMIT 1`, [id]),
        ]);
        const baseDate = new Date().toISOString();
        const fuelCost = fuel.rows.reduce((acc, row) => acc + Number(row.cost_cents || 0), 0);
        const maintenanceCost = maintenance.rows.reduce((acc, row) => acc + Number(row.cost_cents || 0), 0);
        const alert = deriveMaintenanceAlert({
          rule: ruleRows.rows[0] || null,
          lastMaintenance: lastMaintRows.rows[0] || null,
          vehicleMileage: vehicle.rows[0].mileage,
        });
        return json(res, 200, {
          vehicle: vehicleProjection(vehicle.rows[0]),
          fuel_logs: fuel.rows,
          maintenance_logs: maintenance.rows,
          documents: documents.rows,
          responsible_history: responsible.rows,
          events: events.rows,
          maintenance_rule: ruleRows.rows[0] || null,
          maintenance_alert: alert,
          cost: {
            fuel_cost_cents: fuelCost,
            fuel_entries: fuel.rows.length,
            maintenance_cost_cents: maintenanceCost,
            maintenance_entries: maintenance.rows.length,
            total_cents: fuelCost + maintenanceCost,
            source: [FLEET_SOURCES.fuel, FLEET_SOURCES.maintenance],
            base_date: baseDate,
            note: fuel.rows.length === 0 && maintenance.rows.length === 0
              ? "Nenhum custo canônico registrado para este veículo; nada é estimado."
              : "Custo somado exclusivamente dos registros canônicos listados.",
          },
          source: {
            vehicle: FLEET_SOURCES.vehicles,
            fuel_logs: FLEET_SOURCES.fuel,
            maintenance_logs: FLEET_SOURCES.maintenance,
            documents: FLEET_SOURCES.documents,
            responsible_history: FLEET_SOURCES.responsible,
            events: FLEET_SOURCES.events,
          },
          base_date: baseDate,
        });
      } catch (error) {
        console.error("EXT-01 vehicle dossier failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "fleet_unavailable" });
      }
    }
    if (req.method === "PATCH") {
      const session = await guard(req, res, { write: true });
      if (!session) return;
      const { body, tooLarge, invalid } = await readBody(req);
      if (tooLarge) return json(res, 413, { error: "body_too_large" });
      if (invalid) return json(res, 400, { error: "invalid_request" });
      const hasStatus = body.status !== undefined;
      const hasMileage = body.mileage !== undefined;
      if (!hasStatus && !hasMileage) return json(res, 400, { error: "nothing_to_update" });
      const status = hasStatus ? String(body.status) : null;
      const mileage = hasMileage ? Number(body.mileage) : null;
      if (hasStatus && !VEHICLE_STATUSES.includes(status)) return json(res, 400, { error: "invalid_status" });
      if (hasMileage && (!Number.isInteger(mileage) || mileage < 0)) return json(res, 400, { error: "invalid_mileage" });

      const key = idempotencyKeyOf(req, res);
      if (!key) return;
      const fingerprint = fingerprintOf({ op: "vehicle_update", id, status, mileage });

      return runMutation(res, {
        session, key, fingerprint,
        audit: { action: "ext_fleet_vehicle_update" },
        onReplay: async (client, event) => {
          const { rows } = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1`, [event.vehicle_id]);
          return { vehicle: rows[0] ? vehicleProjection(rows[0]) : null };
        },
        work: async client => {
          const existing = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE`, [id]);
          if (!existing.rows[0]) return { deny: { code: 404, body: { error: "vehicle_not_found" } } };
          // Quilometragem canônica não anda para trás.
          if (hasMileage && mileage < existing.rows[0].mileage) {
            return { deny: { code: 400, body: { error: "mileage_regression" } } };
          }
          const nextStatus = hasStatus ? status : existing.rows[0].status;
          const nextMileage = hasMileage ? mileage : existing.rows[0].mileage;
          const { rows } = await client.query(
            `UPDATE ext_fleet_vehicles SET status=$2, mileage=$3, updated_at=NOW() WHERE id=$1 RETURNING *`,
            [id, nextStatus, nextMileage],
          );
          await insertEvent(client, {
            vehicleId: id, eventType: "situacao_atualizada",
            summary: `Situação/quilometragem atualizada: ${existing.rows[0].status}→${nextStatus}, km ${existing.rows[0].mileage}→${nextMileage}.`,
            payload: { previous_status: existing.rows[0].status, status: nextStatus, previous_mileage: existing.rows[0].mileage, mileage: nextMileage },
            key, fingerprint, identityId: session.identityId,
          });
          return {
            code: 200,
            body: { vehicle: vehicleProjection(rows[0]) },
            auditTarget: id,
            auditMeta: { status: nextStatus, mileage: nextMileage },
          };
        },
      });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/fleet/vehicles/<uuid>/responsible — atribuição com histórico
  // imutável; autor derivado da sessão.
  // -------------------------------------------------------------------------
  async function handleVehicleResponsible(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const responsibleName = typeof body.responsible_name === "string" ? body.responsible_name.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (responsibleName.length < 2 || responsibleName.length > 200) return json(res, 400, { error: "invalid_responsible_name" });
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "responsible_assign", id, responsibleName, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_fleet_responsible_assign" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1`, [event.vehicle_id]);
        return { vehicle: rows[0] ? vehicleProjection(rows[0]) : null };
      },
      work: async client => {
        const existing = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE`, [id]);
        if (!existing.rows[0]) return { deny: { code: 404, body: { error: "vehicle_not_found" } } };
        await client.query(
          `INSERT INTO ext_fleet_responsible_history
             (vehicle_id, previous_responsible_name, responsible_name, reason, assigned_by_identity)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, existing.rows[0].responsible_name, responsibleName, reason, session.identityId],
        );
        const { rows } = await client.query(
          `UPDATE ext_fleet_vehicles SET responsible_name=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, responsibleName],
        );
        await insertEvent(client, {
          vehicleId: id, eventType: "responsavel_atribuido",
          summary: `Responsável atribuído: ${responsibleName}.`,
          payload: { previous_responsible_name: existing.rows[0].responsible_name, responsible_name: responsibleName },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { vehicle: vehicleProjection(rows[0]), note: "Atribuição registrada com histórico imutável; autor derivado da sessão." },
          auditTarget: id,
          auditMeta: { responsible_name: responsibleName },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/fleet/vehicles/<uuid>/fuel-logs — abastecimento apenas-acréscimo.
  // O vínculo com o veículo vem da URL; vehicle_id no corpo é ignorado.
  // -------------------------------------------------------------------------
  async function handleVehicleFuelLogs(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const fuelDate = typeof body.fuel_date === "string" ? body.fuel_date : "";
    const liters = Number(body.liters);
    const costCents = Number(body.cost_cents);
    const mileage = body.mileage == null || body.mileage === "" ? null : Number(body.mileage);
    const station = typeof body.station === "string" && body.station.trim() ? body.station.trim() : null;
    if (!isIsoDate(fuelDate)) return json(res, 400, { error: "invalid_fuel_date" });
    if (fuelDate > todayIso()) return json(res, 400, { error: "fuel_date_in_future" });
    if (!Number.isFinite(liters) || liters <= 0 || liters > 100000) return json(res, 400, { error: "invalid_liters" });
    if (!Number.isInteger(costCents) || costCents < 0) return json(res, 400, { error: "invalid_cost_cents" });
    if (mileage !== null && (!Number.isInteger(mileage) || mileage < 0)) return json(res, 400, { error: "invalid_mileage" });
    if (station !== null && (station.length < 3 || station.length > 200)) return json(res, 400, { error: "invalid_station" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "fuel_create", id, fuelDate, liters, costCents, mileage, station });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_fleet_fuel_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_fleet_fuel_logs WHERE id=$1`, [recordId])
          : { rows: [] };
        return { fuel_log: rows[0] ?? null };
      },
      work: async client => {
        const vehicle = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE`, [id]);
        if (!vehicle.rows[0]) return { deny: { code: 404, body: { error: "vehicle_not_found" } } };
        const { rows } = await client.query(
          `INSERT INTO ext_fleet_fuel_logs
             (vehicle_id, fuel_date, liters, cost_cents, mileage, station, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [id, fuelDate, liters, costCents, mileage, station, session.identityId],
        );
        // Quilometragem do veículo só avança com registro canônico maior.
        if (mileage !== null && mileage > vehicle.rows[0].mileage) {
          await client.query(`UPDATE ext_fleet_vehicles SET mileage=$2, updated_at=NOW() WHERE id=$1`, [id, mileage]);
        }
        await insertEvent(client, {
          vehicleId: id, eventType: "abastecimento_registrado",
          summary: `Abastecimento registrado em ${fuelDate}: ${liters} L, ${costCents} centavos.`,
          payload: { record_id: rows[0].id, fuel_date: fuelDate, liters, cost_cents: costCents },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { fuel_log: rows[0], note: "Abastecimento canônico registrado; custo por veículo soma apenas registros assim." },
          auditTarget: rows[0].id,
          auditMeta: { vehicle_id: id, cost_cents: costCents },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/fleet/vehicles/<uuid>/maintenance-logs — manutenção
  // apenas-acréscimo; atualização de last/next do veículo na MESMA transação.
  // -------------------------------------------------------------------------
  async function handleVehicleMaintenanceLogs(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const maintenanceType = typeof body.maintenance_type === "string" ? body.maintenance_type.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const costCents = Number(body.cost_cents);
    const mileage = body.mileage == null || body.mileage === "" ? null : Number(body.mileage);
    const performedAt = typeof body.performed_at === "string" ? body.performed_at : "";
    const nextDueDate = typeof body.next_due_date === "string" && body.next_due_date ? body.next_due_date : null;
    if (maintenanceType.length < 3 || maintenanceType.length > 100) return json(res, 400, { error: "invalid_maintenance_type" });
    if (description.length < 10 || description.length > 2000) return json(res, 400, { error: "invalid_description" });
    if (!Number.isInteger(costCents) || costCents < 0) return json(res, 400, { error: "invalid_cost_cents" });
    if (mileage !== null && (!Number.isInteger(mileage) || mileage < 0)) return json(res, 400, { error: "invalid_mileage" });
    if (!isIsoDate(performedAt)) return json(res, 400, { error: "invalid_performed_at" });
    if (performedAt > todayIso()) return json(res, 400, { error: "performed_at_in_future" });
    if (nextDueDate !== null && !isIsoDate(nextDueDate)) return json(res, 400, { error: "invalid_next_due_date" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "maintenance_create", id, maintenanceType, description, costCents, mileage, performedAt, nextDueDate });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_fleet_maintenance_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_fleet_maintenance_logs WHERE id=$1`, [recordId])
          : { rows: [] };
        return { maintenance_log: rows[0] ?? null };
      },
      work: async client => {
        const vehicle = await client.query(`SELECT * FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE`, [id]);
        if (!vehicle.rows[0]) return { deny: { code: 404, body: { error: "vehicle_not_found" } } };
        const { rows } = await client.query(
          `INSERT INTO ext_fleet_maintenance_logs
             (vehicle_id, maintenance_type, description, cost_cents, mileage, performed_at, next_due_date, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [id, maintenanceType, description, costCents, mileage, performedAt, nextDueDate, session.identityId],
        );
        const previousLast = dateOnly(vehicle.rows[0].last_maintenance_date);
        const newLast = previousLast && previousLast > performedAt ? previousLast : performedAt;
        await client.query(
          `UPDATE ext_fleet_vehicles SET last_maintenance_date=$2, next_maintenance_date=COALESCE($3, next_maintenance_date), updated_at=NOW() WHERE id=$1`,
          [id, newLast, nextDueDate],
        );
        if (mileage !== null && mileage > vehicle.rows[0].mileage) {
          await client.query(`UPDATE ext_fleet_vehicles SET mileage=$2, updated_at=NOW() WHERE id=$1`, [id, mileage]);
        }
        await insertEvent(client, {
          vehicleId: id, eventType: "manutencao_registrada",
          summary: `Manutenção '${maintenanceType}' registrada em ${performedAt}, ${costCents} centavos.`,
          payload: { record_id: rows[0].id, maintenance_type: maintenanceType, performed_at: performedAt, cost_cents: costCents },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { maintenance_log: rows[0], note: "Manutenção canônica registrada; veículo atualizado na mesma transação." },
          auditTarget: rows[0].id,
          auditMeta: { vehicle_id: id, maintenance_type: maintenanceType },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/fleet/vehicles/<uuid>/documents — metadados sintéticos de
  // documento (sem upload real nesta fatia; a ausência de bytes é declarada).
  // -------------------------------------------------------------------------
  async function handleVehicleDocuments(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";
    const documentNumber = typeof body.document_number === "string" && body.document_number.trim() ? body.document_number.trim() : null;
    const expiryDate = typeof body.expiry_date === "string" && body.expiry_date ? body.expiry_date : null;
    const fileName = typeof body.file_name === "string" && body.file_name.trim() ? body.file_name.trim() : null;
    if (documentType.length < 3 || documentType.length > 100) return json(res, 400, { error: "invalid_document_type" });
    if (documentNumber !== null && (documentNumber.length < 3 || documentNumber.length > 200)) return json(res, 400, { error: "invalid_document_number" });
    if (expiryDate !== null && !isIsoDate(expiryDate)) return json(res, 400, { error: "invalid_expiry_date" });
    if (fileName !== null && (fileName.length < 1 || fileName.length > 500)) return json(res, 400, { error: "invalid_file_name" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_create", id, documentType, documentNumber, expiryDate, fileName });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_fleet_document_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_fleet_documents WHERE id=$1`, [recordId])
          : { rows: [] };
        return { document: rows[0] ?? null };
      },
      work: async client => {
        const vehicle = await client.query(`SELECT id FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE`, [id]);
        if (!vehicle.rows[0]) return { deny: { code: 404, body: { error: "vehicle_not_found" } } };
        const { rows } = await client.query(
          `INSERT INTO ext_fleet_documents
             (vehicle_id, document_type, document_number, expiry_date, file_name, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [id, documentType, documentNumber, expiryDate, fileName, session.identityId],
        );
        await insertEvent(client, {
          vehicleId: id, eventType: "documento_registrado",
          summary: `Documento '${documentType}' registrado${expiryDate ? ` com vencimento ${expiryDate}` : ""}.`,
          payload: { record_id: rows[0].id, document_type: documentType, expiry_date: expiryDate },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { document: rows[0], note: "Registro de metadados do documento; nenhum arquivo real é armazenado nesta fatia." },
          auditTarget: rows[0].id,
          auditMeta: { vehicle_id: id, document_type: documentType },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // PATCH /api/ext/fleet/documents/<uuid> — desativação declarada; nunca DELETE.
  // -------------------------------------------------------------------------
  async function handleDocumentById(req, res, docId) {
    if (!UUID_PATTERN.test(String(docId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_deactivate", docId, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_fleet_document_deactivate" },
      onReplay: async client => {
        const { rows } = await client.query(`SELECT * FROM ext_fleet_documents WHERE id=$1`, [docId]);
        return { document: rows[0] ?? null };
      },
      work: async client => {
        const existing = await client.query(`SELECT * FROM ext_fleet_documents WHERE id=$1 FOR UPDATE`, [docId]);
        if (!existing.rows[0]) return { deny: { code: 404, body: { error: "document_not_found" } } };
        if (existing.rows[0].is_active === false) return { deny: { code: 409, body: { error: "document_already_inactive" } } };
        const { rows } = await client.query(
          `UPDATE ext_fleet_documents
              SET is_active=false, deactivated_at=NOW(), deactivated_by_identity=$2, deactivate_reason=$3
            WHERE id=$1 RETURNING *`,
          [docId, session.identityId, reason],
        );
        await insertEvent(client, {
          vehicleId: existing.rows[0].vehicle_id, eventType: "documento_desativado",
          summary: `Documento '${existing.rows[0].document_type}' desativado: ${reason}`,
          payload: { record_id: docId, reason },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: { document: rows[0], note: "Documento desativado com autor e motivo; o registro permanece para histórico." },
          auditTarget: docId,
          auditMeta: { vehicle_id: existing.rows[0].vehicle_id },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/fleet/vehicles/<uuid>/maintenance-rules — regra
  // explícita do alerta; registrar nova desativa a anterior na mesma transação.
  // -------------------------------------------------------------------------
  async function handleVehicleMaintenanceRules(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const vehicle = await pool.query(`SELECT id FROM ext_fleet_vehicles WHERE id=$1`, [id]);
        if (!vehicle.rows[0]) return json(res, 404, { error: "vehicle_not_found" });
        const { rows } = await pool.query(
          `SELECT * FROM ext_fleet_maintenance_rules WHERE vehicle_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [id],
        );
        return json(res, 200, { rules: rows, source: FLEET_SOURCES.rules, base_date: new Date().toISOString() });
      } catch (error) {
        console.error("EXT-01 rules list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "fleet_unavailable" });
      }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });
    const intervalDays = body.interval_days == null || body.interval_days === "" ? null : Number(body.interval_days);
    const intervalKm = body.interval_km == null || body.interval_km === "" ? null : Number(body.interval_km);
    const alertBeforeDays = body.alert_before_days == null || body.alert_before_days === "" ? 15 : Number(body.alert_before_days);
    const alertBeforeKm = body.alert_before_km == null || body.alert_before_km === "" ? 500 : Number(body.alert_before_km);
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (intervalDays === null && intervalKm === null) return json(res, 400, { error: "interval_required" });
    if (intervalDays !== null && (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650)) return json(res, 400, { error: "invalid_interval_days" });
    if (intervalKm !== null && (!Number.isInteger(intervalKm) || intervalKm < 1 || intervalKm > 1000000)) return json(res, 400, { error: "invalid_interval_km" });
    if (!Number.isInteger(alertBeforeDays) || alertBeforeDays < 0 || alertBeforeDays > 365) return json(res, 400, { error: "invalid_alert_before_days" });
    if (!Number.isInteger(alertBeforeKm) || alertBeforeKm < 0 || alertBeforeKm > 100000) return json(res, 400, { error: "invalid_alert_before_km" });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "rule_create", id, intervalDays, intervalKm, alertBeforeDays, alertBeforeKm, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_fleet_rule_create" },
      onReplay: async (client, event) => {
        const recordId = event.payload?.record_id ?? null;
        const { rows } = recordId
          ? await client.query(`SELECT * FROM ext_fleet_maintenance_rules WHERE id=$1`, [recordId])
          : { rows: [] };
        return { rule: rows[0] ?? null };
      },
      work: async client => {
        const vehicle = await client.query(`SELECT id FROM ext_fleet_vehicles WHERE id=$1 FOR UPDATE`, [id]);
        if (!vehicle.rows[0]) return { deny: { code: 404, body: { error: "vehicle_not_found" } } };
        // Uma regra ativa por veículo: a anterior é desativada com autor e data.
        await client.query(
          `UPDATE ext_fleet_maintenance_rules
              SET is_active=false, deactivated_at=NOW(), deactivated_by_identity=$2
            WHERE vehicle_id=$1 AND is_active`,
          [id, session.identityId],
        );
        const { rows } = await client.query(
          `INSERT INTO ext_fleet_maintenance_rules
             (vehicle_id, interval_days, interval_km, alert_before_days, alert_before_km, justification, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [id, intervalDays, intervalKm, alertBeforeDays, alertBeforeKm, justification, session.identityId],
        );
        await insertEvent(client, {
          vehicleId: id, eventType: "regra_manutencao_registrada",
          summary: `Regra de manutenção registrada: ${intervalDays != null ? `${intervalDays} dias` : ""}${intervalDays != null && intervalKm != null ? " / " : ""}${intervalKm != null ? `${intervalKm} km` : ""}.`,
          payload: { record_id: rows[0].id, interval_days: intervalDays, interval_km: intervalKm },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { rule: rows[0], note: "Regra explícita registrada; o alerta deriva somente dela e da base canônica." },
          auditTarget: rows[0].id,
          auditMeta: { vehicle_id: id, interval_days: intervalDays, interval_km: intervalKm },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Rotas legadas (/api/ext/fleet-*): leitura com a mesma autorização e fontes
  // declaradas; mutações foram aposentadas em favor da jornada canônica — a
  // rota antiga não é atalho sem idempotência/transação.
  // -------------------------------------------------------------------------
  const LEGACY_COLLECTIONS = {
    "fuel-logs": {
      sql: `SELECT fl.id, fl.vehicle_id, fl.fuel_date, fl.liters, fl.cost_cents, fl.mileage, fl.station, fl.created_at, v.plate
              FROM ext_fleet_fuel_logs fl JOIN ext_fleet_vehicles v ON v.id = fl.vehicle_id`,
      filterColumn: "fl.vehicle_id",
      order: " ORDER BY fl.fuel_date DESC, fl.created_at DESC LIMIT 200",
      source: FLEET_SOURCES.fuel,
      canonical: "/api/ext/fleet/vehicles/<id>/fuel-logs",
    },
    "maintenance-logs": {
      sql: `SELECT ml.id, ml.vehicle_id, ml.maintenance_type, ml.description, ml.cost_cents, ml.mileage, ml.performed_at, ml.next_due_date, ml.created_at, v.plate
              FROM ext_fleet_maintenance_logs ml JOIN ext_fleet_vehicles v ON v.id = ml.vehicle_id`,
      filterColumn: "ml.vehicle_id",
      order: " ORDER BY ml.performed_at DESC, ml.created_at DESC LIMIT 200",
      source: FLEET_SOURCES.maintenance,
      canonical: "/api/ext/fleet/vehicles/<id>/maintenance-logs",
    },
    documents: {
      sql: `SELECT d.id, d.vehicle_id, d.document_type, d.document_number, d.expiry_date, d.file_name, d.is_active, d.deactivated_at, d.deactivate_reason, d.created_at
              FROM ext_fleet_documents d`,
      filterColumn: "d.vehicle_id",
      order: " ORDER BY d.created_at DESC LIMIT 200",
      source: FLEET_SOURCES.documents,
      canonical: "/api/ext/fleet/vehicles/<id>/documents",
    },
  };

  function legacyCollectionHandler(kind) {
    const config = LEGACY_COLLECTIONS[kind];
    return async function handleLegacy(req, res) {
      if (req.method !== "GET") {
        return json(res, 410, { error: "legacy_route_retired", use: config.canonical });
      }
      const session = await guard(req, res, { write: false });
      if (!session) return;
      try {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const vehicleId = url.searchParams.get("vehicle_id");
        if (vehicleId !== null && !UUID_PATTERN.test(vehicleId)) return json(res, 400, { error: "invalid_vehicle_id" });
        const params = [];
        let sql = config.sql;
        if (vehicleId) { params.push(vehicleId); sql += ` WHERE ${config.filterColumn}=$1`; }
        sql += config.order;
        const { rows } = await pool.query(sql, params);
        return json(res, 200, { items: rows, source: config.source, base_date: new Date().toISOString() });
      } catch (error) {
        console.error(`EXT-01 legacy ${kind} list failed`, error instanceof Error ? error.message : error);
        return json(res, 503, { error: "fleet_unavailable" });
      }
    };
  }

  async function handleLegacyVehicles(req, res) {
    if (req.method !== "GET") {
      return json(res, 410, { error: "legacy_route_retired", use: "/api/ext/fleet/vehicles" });
    }
    return handleVehicles(req, res);
  }

  return {
    handleVehicles,
    handleVehicleById,
    handleVehicleResponsible,
    handleVehicleFuelLogs,
    handleVehicleMaintenanceLogs,
    handleVehicleDocuments,
    handleDocumentById,
    handleVehicleMaintenanceRules,
    handleLegacyVehicles,
    handleLegacyFuelLogs: legacyCollectionHandler("fuel-logs"),
    handleLegacyMaintenanceLogs: legacyCollectionHandler("maintenance-logs"),
    handleLegacyDocuments: legacyCollectionHandler("documents"),
  };
}
