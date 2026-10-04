// EXT-09 — Planejamento de Expansão, Capacidade e Cenários Financeiros Canônicos
// Regras de negócio, transições estritas, estimativas declaradas, idempotência,
// locks de concorrência e auditoria atômica transacional.

import { createHash, randomBytes } from "node:crypto";

const STAFF_ROLES = ["marcelo", "admin", "ti", "comercial", "financeiro"];
const EDIT_ROLES = ["marcelo", "admin", "ti", "comercial"];
const APPROVE_ROLES = ["marcelo", "admin"];

const VALID_TRANSITIONS = {
  rascunho: ["em_analise", "cancelado"],
  em_analise: ["aprovado", "rejeitado", "rascunho", "cancelado"],
  aprovado: ["em_execucao", "cancelado"],
  rejeitado: ["rascunho"],
  em_execucao: ["concluido", "cancelado"],
  concluido: [],
  cancelado: [],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fp(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function generateProtocol() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `EXP-EXT-${yyyy}${mm}${dd}-${rand}`;
}

export function createExtExpansionApi({ pool, sameOrigin, requireSession }) {
  function json(res, status, data) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  }

  function getRole(session) {
    return session?.role || session?.staffRole || "admin";
  }

  async function guard(req, res, { write = false, requiredRoles = STAFF_ROLES } = {}) {
    let s;
    try {
      s = await requireSession(req);
    } catch {
      s = null;
    }
    if (!s || !s.identityId) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    const role = getRole(s);
    if (!requiredRoles.includes(role)) {
      json(res, 403, { error: "forbidden_role", required: requiredRoles, current: role });
      return null;
    }
    if (write && !sameOrigin(req)) {
      json(res, 403, { error: "origin_forbidden" });
      return null;
    }
    return s;
  }

  async function parseBody(req) {
    let buf = "";
    for await (const chunk of req) {
      buf += chunk;
      if (buf.length > 256 * 1024) {
        return { error: "payload_too_large", status: 413 };
      }
    }
    if (!buf.trim()) return { data: {} };
    try {
      return { data: JSON.parse(buf) };
    } catch {
      return { error: "invalid_json", status: 400 };
    }
  }

  function text(v, min = 0, max = 2000) {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length < min || t.length > max) return null;
    return t;
  }

  function num(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return Math.floor(n);
  }

  function requireKey(req, res) {
    const k = String(req.headers["idempotency-key"] || "").trim();
    if (!k || k.length < 5 || k.length > 200) {
      json(res, 400, { error: "idempotency_key_required" });
      return null;
    }
    return k;
  }

  async function recordEvent(client, { planId, eventType, summary, payload, idempotencyKey, requestFingerprint, identityId }) {
    await client.query(
      `INSERT INTO ext_expansion_events
         (plan_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [planId, eventType, summary, JSON.stringify(payload || {}), idempotencyKey, requestFingerprint, identityId]
    );
  }

  async function executeMutation(res, { session, idempotencyKey, requestFingerprint, auditAction, replay, work }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ext-expansion-${idempotencyKey}`]);

      const existingEvent = await client.query(
        `SELECT * FROM ext_expansion_events WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existingEvent.rows.length > 0) {
        const ev = existingEvent.rows[0];
        if (ev.request_fingerprint !== requestFingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_conflict_payload_mismatch" });
        }
        const replayData = await replay(client, ev);
        await client.query("COMMIT");
        return json(res, 200, { ...replayData, replayed: true });
      }

      const outcome = await work(client);
      if (outcome.error) {
        await client.query("ROLLBACK");
        return json(res, outcome.status || 400, { error: outcome.error, message: outcome.message });
      }

      try {
        await client.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('staff', $1, $2, $3, 'allowed', 'none')`,
          [session.identityId, auditAction, outcome.auditTarget || outcome.planId || "expansion"]
        );
      } catch (auditErr) {
        await client.query("ROLLBACK");
        console.error("EXT-09 audit failure", auditErr?.message || auditErr);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, outcome.statusCode || 200, outcome.response);
    } catch (err) {
      await client?.query("ROLLBACK").catch(() => {});
      if (err.code === "23505" && idempotencyKey) {
        try {
          const rechecked = await client.query(
            `SELECT * FROM ext_expansion_events WHERE idempotency_key = $1`,
            [idempotencyKey]
          );
          if (rechecked.rows.length > 0) {
            if (rechecked.rows[0].request_fingerprint !== requestFingerprint) {
              return json(res, 409, { error: "idempotency_conflict_payload_mismatch" });
            }
            const replayData = await replay(client, rechecked.rows[0]);
            return json(res, 200, { ...replayData, replayed: true });
          }
        } catch {}
      }
      console.error("EXT-09 mutation error", err?.message || err);
      return json(res, 500, { error: "internal_error", detail: err?.message });
    } finally {
      client?.release();
    }
  }

  // --- Handlers ---

  async function handleListPlans(req, res, session) {
    const url = new URL(req.url, "http://localhost");
    const statusParam = text(url.searchParams.get("status"), 1, 50);
    const qParam = text(url.searchParams.get("q"), 1, 100);
    const locationParam = text(url.searchParams.get("location"), 1, 100);

    const conditions = [];
    const params = [];

    if (statusParam) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(statusParam);
    }
    if (locationParam) {
      conditions.push(`target_location ILIKE $${params.length + 1}`);
      params.push(`%${locationParam}%`);
    }
    if (qParam) {
      conditions.push(`(title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR premises ILIKE $${params.length + 1} OR target_location ILIKE $${params.length + 1} OR protocol ILIKE $${params.length + 1})`);
      params.push(`%${qParam}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT p.id, p.protocol, p.title, p.description, p.premises, p.target_location,
             p.capacity, p.estimated_cost_cents, p.estimated_revenue_cents,
             (CASE WHEN p.estimated_revenue_cents IS NOT NULL AND p.estimated_cost_cents IS NOT NULL
                   THEN p.estimated_revenue_cents - p.estimated_cost_cents ELSE NULL END) AS estimated_margin_cents,
             p.status, p.is_estimate, p.estimate_note, p.justification,
             p.created_by_identity, p.approved_by_identity, p.approved_at,
             p.executed_at, p.completed_at, p.cancelled_at, p.created_at, p.updated_at,
             (SELECT count(*)::int FROM ext_expansion_scenarios s WHERE s.plan_id = p.id) AS scenarios_count
        FROM ext_expansion_plans p
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT 200
    `;

    try {
      const { rows } = await pool.query(query, params);
      return json(res, 200, {
        items: rows,
        count: rows.length,
        criteria: "Planejamento de filial/contrato, capacidade e cenários financeiros com estimativas declaradas",
      });
    } catch (err) {
      console.error("EXT-09 list error", err?.message || err);
      return json(res, 500, { error: "database_error" });
    }
  }

  async function handleGetPlanDetail(req, res, session, id) {
    if (!UUID_RE.test(id)) return json(res, 400, { error: "invalid_plan_id" });

    try {
      const { rows: planRows } = await pool.query(
        `SELECT p.id, p.protocol, p.title, p.description, p.premises, p.target_location,
                p.capacity, p.estimated_cost_cents, p.estimated_revenue_cents,
                (CASE WHEN p.estimated_revenue_cents IS NOT NULL AND p.estimated_cost_cents IS NOT NULL
                      THEN p.estimated_revenue_cents - p.estimated_cost_cents ELSE NULL END) AS estimated_margin_cents,
                p.status, p.is_estimate, p.estimate_note, p.justification,
                p.created_by_identity, p.approved_by_identity, p.approved_at,
                p.executed_at, p.completed_at, p.cancelled_at, p.created_at, p.updated_at
           FROM ext_expansion_plans p
          WHERE p.id = $1`,
        [id]
      );
      if (planRows.length === 0) return json(res, 404, { error: "plan_not_found" });

      const plan = planRows[0];

      const { rows: scenarios } = await pool.query(
        `SELECT id, plan_id, scenario_name, premises, projected_cost_cents,
                projected_revenue_cents, projected_margin_cents, is_estimate,
                estimate_note, created_at
           FROM ext_expansion_scenarios
          WHERE plan_id = $1
          ORDER BY created_at ASC`,
        [id]
      );

      const { rows: events } = await pool.query(
        `SELECT id, event_type, summary, payload, created_by_identity, created_at
           FROM ext_expansion_events
          WHERE plan_id = $1
          ORDER BY created_at ASC`,
        [id]
      );

      return json(res, 200, {
        plan: {
          ...plan,
          scenarios,
          events,
        },
      });
    } catch (err) {
      console.error("EXT-09 detail error", err?.message || err);
      return json(res, 500, { error: "database_error" });
    }
  }

  async function handleCreatePlan(req, res, session) {
    const k = requireKey(req, res);
    if (!k) return;

    const bodyResult = await parseBody(req);
    if (bodyResult.error) return json(res, bodyResult.status, { error: bodyResult.error });
    const b = bodyResult.data || {};

    const title = text(b.title, 5, 200);
    const description = text(b.description, 10, 2000);
    const premises = text(b.premises, 10, 2000);
    const targetLocation = text(b.target_location, 3, 200);
    const capacity = num(b.capacity, 0, 1000000);
    const estimatedCostCents = num(b.estimated_cost_cents, 0, 100000000000);
    const estimatedRevenueCents = num(b.estimated_revenue_cents, 0, 100000000000);

    if (!title) return json(res, 400, { error: "invalid_title", message: "Título deve ter entre 5 e 200 caracteres" });
    if (!description) return json(res, 400, { error: "invalid_description", message: "Descrição deve ter entre 10 e 2000 caracteres" });
    if (!premises) return json(res, 400, { error: "invalid_premises", message: "Premissas devem ter entre 10 e 2000 caracteres" });
    if (!targetLocation) return json(res, 400, { error: "invalid_target_location", message: "Local alvo deve ter entre 3 e 200 caracteres" });

    const requestFingerprint = fp({ op: "create_plan", title, description, premises, targetLocation, capacity, estimatedCostCents, estimatedRevenueCents });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "expansion_plan_create",
      replay: async (client, event) => {
        const row = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1`, [event.plan_id])).rows[0];
        return { plan: row };
      },
      work: async (client) => {
        let protocol = generateProtocol();
        // Garantir unicidade do protocolo
        for (let i = 0; i < 5; i++) {
          const exists = (await client.query(`SELECT 1 FROM ext_expansion_plans WHERE protocol = $1`, [protocol])).rows.length > 0;
          if (!exists) break;
          protocol = generateProtocol();
        }

        const insertRes = await client.query(
          `INSERT INTO ext_expansion_plans
             (protocol, title, description, premises, target_location, capacity,
              estimated_cost_cents, estimated_revenue_cents, status, is_estimate,
              origin, idempotency_key, request_fingerprint, created_by_identity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rascunho', true, 'ext09_canonica', $9, $10, $11)
           RETURNING *`,
          [
            protocol, title, description, premises, targetLocation,
            capacity, estimatedCostCents, estimatedRevenueCents,
            k, requestFingerprint, session.identityId
          ]
        );
        const plan = insertRes.rows[0];

        await recordEvent(client, {
          planId: plan.id,
          eventType: "plano_criado",
          summary: `Plano de expansão ${protocol} criado como rascunho`,
          payload: { title, targetLocation, capacity },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          planId: plan.id,
          statusCode: 201,
          response: { plan },
        };
      },
    });
  }

  async function handleUpdatePlan(req, res, session, id) {
    if (!UUID_RE.test(id)) return json(res, 400, { error: "invalid_plan_id" });

    const k = requireKey(req, res);
    if (!k) return;

    const bodyResult = await parseBody(req);
    if (bodyResult.error) return json(res, bodyResult.status, { error: bodyResult.error });
    const b = bodyResult.data || {};

    const title = text(b.title, 5, 200);
    const description = text(b.description, 10, 2000);
    const premises = text(b.premises, 10, 2000);
    const targetLocation = text(b.target_location, 3, 200);
    const capacity = num(b.capacity, 0, 1000000);
    const estimatedCostCents = num(b.estimated_cost_cents, 0, 100000000000);
    const estimatedRevenueCents = num(b.estimated_revenue_cents, 0, 100000000000);

    const requestFingerprint = fp({ op: "update_plan", id, title, description, premises, targetLocation, capacity, estimatedCostCents, estimatedRevenueCents });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "expansion_plan_update",
      replay: async (client, event) => {
        const row = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1`, [event.plan_id])).rows[0];
        return { plan: row };
      },
      work: async (client) => {
        const existing = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!existing) return { error: "plan_not_found", status: 404 };

        if (!["rascunho", "em_analise"].includes(existing.status)) {
          return { error: "cannot_update_in_current_status", status: 409, message: "Apenas planos em rascunho ou em análise podem ser editados" };
        }

        const updateRes = await client.query(
          `UPDATE ext_expansion_plans
              SET title = COALESCE($2, title),
                  description = COALESCE($3, description),
                  premises = COALESCE($4, premises),
                  target_location = COALESCE($5, target_location),
                  capacity = COALESCE($6, capacity),
                  estimated_cost_cents = COALESCE($7, estimated_cost_cents),
                  estimated_revenue_cents = COALESCE($8, estimated_revenue_cents),
                  updated_at = NOW()
            WHERE id = $1
            RETURNING *`,
          [
            id, title, description, premises, targetLocation,
            capacity, estimatedCostCents, estimatedRevenueCents
          ]
        );
        const updated = updateRes.rows[0];

        await recordEvent(client, {
          planId: id,
          eventType: "plano_atualizado",
          summary: `Plano ${updated.protocol} atualizado`,
          payload: { title, targetLocation },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          planId: id,
          statusCode: 200,
          response: { plan: updated },
        };
      },
    });
  }

  async function handleTransitionPlan(req, res, session, id) {
    if (!UUID_RE.test(id)) return json(res, 400, { error: "invalid_plan_id" });

    const k = requireKey(req, res);
    if (!k) return;

    const bodyResult = await parseBody(req);
    if (bodyResult.error) return json(res, bodyResult.status, { error: bodyResult.error });
    const b = bodyResult.data || {};

    const nextStatus = text(b.status, 3, 50);
    const notes = text(b.notes, 0, 1000) || "";
    const justification = text(b.justification, 5, 2000);

    if (!nextStatus || !["rascunho", "em_analise", "aprovado", "rejeitado", "em_execucao", "concluido", "cancelado"].includes(nextStatus)) {
      return json(res, 400, { error: "invalid_status" });
    }

    const role = getRole(session);
    if (["aprovado", "rejeitado", "em_execucao", "concluido", "cancelado"].includes(nextStatus) && !APPROVE_ROLES.includes(role)) {
      return json(res, 403, { error: "approve_permission_required" });
    }

    if (["rejeitado", "cancelado"].includes(nextStatus) && !justification) {
      return json(res, 400, { error: "justification_required", message: "Rejeição ou cancelamento exige justificativa formal (mínimo 5 caracteres)" });
    }

    const requestFingerprint = fp({ op: "transition_plan", id, nextStatus, notes, justification });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: `expansion_plan_transition_${nextStatus}`,
      replay: async (client, event) => {
        const row = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1`, [event.plan_id])).rows[0];
        return { plan: row };
      },
      work: async (client) => {
        const existing = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!existing) return { error: "plan_not_found", status: 404 };

        const allowed = VALID_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(nextStatus)) {
          return {
            error: "invalid_transition",
            status: 409,
            message: `Transição inválida de ${existing.status} para ${nextStatus}. Permitidas: ${allowed.join(", ") || "nenhuma"}`,
          };
        }

        let updated;
        if (nextStatus === "aprovado") {
          updated = (await client.query(
            `UPDATE ext_expansion_plans
                SET status = 'aprovado',
                    approved_by_identity = $2,
                    approved_at = NOW(),
                    updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id, session.identityId]
          )).rows[0];
        } else if (nextStatus === "em_execucao") {
          updated = (await client.query(
            `UPDATE ext_expansion_plans
                SET status = 'em_execucao',
                    executed_at = NOW(),
                    updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id]
          )).rows[0];
        } else if (nextStatus === "concluido") {
          updated = (await client.query(
            `UPDATE ext_expansion_plans
                SET status = 'concluido',
                    completed_at = NOW(),
                    updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id]
          )).rows[0];
        } else if (nextStatus === "cancelado" || nextStatus === "rejeitado") {
          updated = (await client.query(
            `UPDATE ext_expansion_plans
                SET status = $2::ext_expansion_status,
                    justification = $3,
                    cancelled_at = CASE WHEN $2::text = 'cancelado' THEN NOW() ELSE cancelled_at END,
                    updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id, nextStatus, justification]
          )).rows[0];
        } else {
          updated = (await client.query(
            `UPDATE ext_expansion_plans
                SET status = $2::ext_expansion_status,
                    updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id, nextStatus]
          )).rows[0];
        }

        await recordEvent(client, {
          planId: id,
          eventType: `status_${nextStatus}`,
          summary: `Status alterado de ${existing.status} para ${nextStatus}${notes ? ": " + notes : ""}`,
          payload: { from: existing.status, to: nextStatus, notes, justification },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          planId: id,
          statusCode: 200,
          response: { plan: updated },
        };
      },
    });
  }

  async function handleAddScenario(req, res, session, planId) {
    if (!UUID_RE.test(planId)) return json(res, 400, { error: "invalid_plan_id" });

    const k = requireKey(req, res);
    if (!k) return;

    const bodyResult = await parseBody(req);
    if (bodyResult.error) return json(res, bodyResult.status, { error: bodyResult.error });
    const b = bodyResult.data || {};

    const scenarioName = text(b.scenario_name, 3, 200);
    const premises = text(b.premises, 10, 2000);
    const projectedCostCents = num(b.projected_cost_cents, 0, 100000000000);
    const projectedRevenueCents = num(b.projected_revenue_cents, 0, 100000000000);

    if (!scenarioName) return json(res, 400, { error: "invalid_scenario_name", message: "Nome do cenário deve ter entre 3 e 200 caracteres" });
    if (!premises) return json(res, 400, { error: "invalid_premises", message: "Premissas devem ter entre 10 e 2000 caracteres" });

    const requestFingerprint = fp({ op: "add_scenario", planId, scenarioName, premises, projectedCostCents, projectedRevenueCents });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "expansion_scenario_create",
      replay: async (client, event) => {
        const scenario = (await client.query(
          `SELECT * FROM ext_expansion_scenarios WHERE plan_id = $1 AND scenario_name = $2`,
          [planId, scenarioName]
        )).rows[0];
        return { scenario };
      },
      work: async (client) => {
        const plan = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE`, [planId])).rows[0];
        if (!plan) return { error: "plan_not_found", status: 404 };

        const duplicate = (await client.query(
          `SELECT 1 FROM ext_expansion_scenarios WHERE plan_id = $1 AND scenario_name = $2`,
          [planId, scenarioName]
        )).rows.length > 0;
        if (duplicate) {
          return { error: "scenario_name_duplicate", status: 409, message: "Já existe um cenário com este nome no plano" };
        }

        const insertRes = await client.query(
          `INSERT INTO ext_expansion_scenarios
             (plan_id, scenario_name, premises, projected_cost_cents, projected_revenue_cents, is_estimate)
           VALUES ($1, $2, $3, $4, $5, true)
           RETURNING *`,
          [planId, scenarioName, premises, projectedCostCents, projectedRevenueCents]
        );
        const scenario = insertRes.rows[0];

        await recordEvent(client, {
          planId,
          eventType: "cenario_adicionado",
          summary: `Cenário financeiro '${scenarioName}' adicionado ao plano`,
          payload: { scenarioName, projectedCostCents, projectedRevenueCents },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          planId,
          statusCode: 201,
          response: { scenario },
        };
      },
    });
  }

  async function handleDeleteScenario(req, res, session, scenarioId) {
    if (!UUID_RE.test(scenarioId)) return json(res, 400, { error: "invalid_scenario_id" });

    const k = requireKey(req, res);
    if (!k) return;

    const requestFingerprint = fp({ op: "delete_scenario", scenarioId });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "expansion_scenario_delete",
      replay: async (client) => {
        return { deleted: true, scenarioId };
      },
      work: async (client) => {
        const scenario = (await client.query(`SELECT * FROM ext_expansion_scenarios WHERE id = $1`, [scenarioId])).rows[0];
        if (!scenario) return { error: "scenario_not_found", status: 404 };

        const plan = (await client.query(`SELECT * FROM ext_expansion_plans WHERE id = $1 FOR UPDATE`, [scenario.plan_id])).rows[0];
        if (!plan) return { error: "plan_not_found", status: 404 };

        if (!["rascunho", "em_analise"].includes(plan.status)) {
          return { error: "cannot_delete_scenario_in_current_status", status: 409, message: "Cenários só podem ser removidos em planos em rascunho ou análise" };
        }

        await client.query(`DELETE FROM ext_expansion_scenarios WHERE id = $1`, [scenarioId]);

        await recordEvent(client, {
          planId: plan.id,
          eventType: "cenario_removido",
          summary: `Cenário '${scenario.scenario_name}' removido`,
          payload: { scenarioName: scenario.scenario_name },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          planId: plan.id,
          statusCode: 200,
          response: { deleted: true, scenarioId },
        };
      },
    });
  }

  // --- Router Principal ---

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const session = await guard(req, res, { write: req.method !== "GET" });
    if (!session) return;

    // GET /api/ext/expansion/plans
    if (url.pathname === "/api/ext/expansion/plans" && req.method === "GET") {
      return handleListPlans(req, res, session);
    }

    // POST /api/ext/expansion/plans
    if (url.pathname === "/api/ext/expansion/plans" && req.method === "POST") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleCreatePlan(req, res, editSession);
    }

    // Detalhe / edição de plano
    const planDetailMatch = url.pathname.match(/^\/api\/ext\/expansion\/plans\/([0-9a-f-]{36})$/i);
    if (planDetailMatch && req.method === "GET") {
      return handleGetPlanDetail(req, res, session, planDetailMatch[1]);
    }
    if (planDetailMatch && req.method === "PATCH") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleUpdatePlan(req, res, editSession, planDetailMatch[1]);
    }

    // Transição de status
    const transitionMatch = url.pathname.match(/^\/api\/ext\/expansion\/plans\/([0-9a-f-]{36})\/transition$/i);
    if (transitionMatch && req.method === "POST") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleTransitionPlan(req, res, editSession, transitionMatch[1]);
    }

    // Adicionar cenário
    const scenarioAddMatch = url.pathname.match(/^\/api\/ext\/expansion\/plans\/([0-9a-f-]{36})\/scenarios$/i);
    if (scenarioAddMatch && req.method === "POST") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleAddScenario(req, res, editSession, scenarioAddMatch[1]);
    }

    // Remover cenário
    const scenarioDelMatch = url.pathname.match(/^\/api\/ext\/expansion\/scenarios\/([0-9a-f-]{36})$/i);
    if (scenarioDelMatch && req.method === "DELETE") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleDeleteScenario(req, res, editSession, scenarioDelMatch[1]);
    }

    return json(res, 404, { error: "not_found" });
  }

  // --- Handlers Legados de compatibilidade ---

  async function handleLegacyPlans(req, res) {
    const session = await guard(req, res, { write: req.method !== "GET" });
    if (!session) return;
    if (req.method === "GET") {
      return handleListPlans(req, res, session);
    }
    return json(res, 410, {
      error: "legacy_expansion_writer_retired",
      canonical: "/api/ext/expansion/plans",
      message: "Escrita legada descontinuada. Utilize a API canônica /api/ext/expansion/plans com Idempotency-Key.",
    });
  }

  async function handleLegacyScenarios(req, res) {
    const session = await guard(req, res, { write: req.method !== "GET" });
    if (!session) return;
    if (req.method === "GET") {
      try {
        const { rows } = await pool.query(
          `SELECT id, plan_id, scenario_name, premises, projected_cost_cents,
                  projected_revenue_cents, projected_margin_cents, is_estimate,
                  estimate_note, created_at
             FROM ext_expansion_scenarios
            ORDER BY created_at DESC LIMIT 200`
        );
        return json(res, 200, { items: rows });
      } catch {
        return json(res, 500, { error: "database_error" });
      }
    }
    return json(res, 410, {
      error: "legacy_expansion_writer_retired",
      canonical: "/api/ext/expansion/plans/:id/scenarios",
      message: "Escrita legada descontinuada. Utilize a API canônica /api/ext/expansion/plans/:id/scenarios.",
    });
  }

  return {
    handle,
    handleLegacyPlans,
    handleLegacyScenarios,
  };
}
