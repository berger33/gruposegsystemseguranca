// EXT-11 / F07 — Analytics e experimentos A/B controlados.
//
// Esta API registra apenas hipóteses, variantes, métrica declarada e
// observações agregadas de registros operacionais internos. Ela não coleta
// tráfego, não chama fornecedor externo, não calcula significância e não
// aceita vencedor ou resultado digitado como verdade.
import { createHash, randomBytes } from "node:crypto";
import { hasPermission } from "./rbac.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const STATUSES = new Set(["rascunho", "em_execucao", "concluido", "cancelado", "arquivado"]);
const SOURCE_TYPES = new Set(["internal_operational_record", "internal_event"]);
const TRANSITIONS = Object.freeze({
  rascunho: ["em_execucao", "cancelado", "arquivado"],
  em_execucao: ["rascunho", "concluido", "cancelado"],
  concluido: ["arquivado"],
  cancelado: ["rascunho", "arquivado"],
  arquivado: [],
});

const text = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max
    ? value.trim()
    : null;

const fingerprint = (payload) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");

// Campos de resultado/vencedor da tabela 086 são legados. A jornada F07 não
// os lê nem os devolve: o único resultado visível é o resumo derivado das
// observações append-only reais.
const publicExperiment = (row) => {
  if (!row) return row;
  const { result_a_value: _legacyA, result_b_value: _legacyB, winner: _legacyWinner, ...safe } = row;
  return safe;
};

const protocol = () => {
  const date = new Date();
  const day = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `AB-EXT-${day}-${randomBytes(2).toString("hex").toUpperCase()}`;
};

export const summarizeObservations = (observations) => {
  const rows = Array.isArray(observations) ? observations : [];
  const byVariant = ["A", "B"].map((variant) => {
    const selected = rows.filter((row) => row.variant === variant);
    return {
      variant,
      observation_count: selected.length,
      sample_size: selected.reduce((sum, row) => sum + Number(row.sample_size || 0), 0),
      metric_total: selected.reduce((sum, row) => sum + Number(row.metric_value || 0), 0),
    };
  });
  const sufficient = byVariant.every((item) => item.observation_count > 0 && item.sample_size > 0);
  return {
    sufficient_for_descriptive_view: sufficient,
    conclusion: sufficient
      ? "dados reais observados; nenhuma significância estatística ou vencedor foi calculado"
      : "dados insuficientes: é necessário ao menos uma observação real de cada variante",
    by_variant: byVariant,
  };
};

export function createExtAnalyticsApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    });
    res.end(JSON.stringify(body));
  };

  async function guard(req, res, permission, { write = false } = {}) {
    let session = null;
    try {
      session = await requireSession(req);
    } catch {}
    if (!session?.identityId || !UUID.test(String(session.identityId))) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    // A role label in a cookie/session is insufficient; the active granular
    // grant is authoritative and is checked fail-closed.
    if (!(await hasPermission(pool, { identityId: String(session.identityId), permission }))) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    if (write && !sameOrigin(req)) {
      json(res, 403, { error: "origin_forbidden" });
      return null;
    }
    return session;
  }

  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 128 * 1024) return { error: "payload_too_large", status: 413 };
    }
    if (!raw.trim()) return { value: {} };
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "invalid_json", status: 400 };
      return { value };
    } catch {
      return { error: "invalid_json", status: 400 };
    }
  }

  function requireKey(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(key)) {
      json(res, 400, { error: "idempotency_key_required" });
      return null;
    }
    return key;
  }

  async function event(client, { experimentId, eventType, summary, payload, key, fp, identityId }) {
    await client.query(
      `INSERT INTO ext_analytics_experiment_events
         (experiment_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [experimentId, eventType, summary, JSON.stringify(payload || {}), key, fp, identityId],
    );
  }

  async function mutation(res, { session, key, fp, action, replay, work }) {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // Serializa o mesmo titular/chave e deixa a linha do experimento ser
      // protegida por FOR UPDATE dentro de work.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext-analytics-${session.identityId}-${key}`]);
      const previous = await client.query(
        `SELECT * FROM ext_analytics_experiment_events
          WHERE created_by_identity = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [session.identityId, key],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fp) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_conflict_payload_mismatch" });
        }
        const replayed = await replay(client, previous.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }

      const result = await work(client);
      if (result.error) {
        await client.query("ROLLBACK");
        return json(res, result.status || 400, { error: result.error, ...(result.message ? { message: result.message } : {}) });
      }

      try {
        await client.query(
          `INSERT INTO auth_access_audit
             (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('staff',$1,$2,$3,'allowed','none')`,
          [session.identityId, action, result.target || result.experimentId || "analytics"],
        );
      } catch (auditError) {
        await client.query("ROLLBACK");
        console.error("EXT-11 audit unavailable", auditError?.message || auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, result.statusCode || 200, result.response);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-11 mutation error", error?.message || error);
      return json(res, 500, { error: "internal_error" });
    } finally {
      client?.release();
    }
  }

  async function getExperiment(clientOrPool, id) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM ext_analytics_experiments
        WHERE id = $1 AND origin = 'ext11_canonica'`,
      [id],
    );
    return publicExperiment(rows[0] || null);
  }

  async function detailData(clientOrPool, id) {
    const experiment = await getExperiment(clientOrPool, id);
    if (!experiment) return null;
    const observations = (await clientOrPool.query(
      `SELECT id, experiment_id, variant, metric_name, metric_value, sample_size,
              source_type, source_reference, source_recorded_at, source_record_id,
              recorded_by_identity, created_at
         FROM ext_analytics_observations
        WHERE experiment_id = $1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    const events = (await clientOrPool.query(
      `SELECT id, event_type, summary, payload, created_by_identity, created_at
         FROM ext_analytics_experiment_events
        WHERE experiment_id = $1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    return { experiment, observations, events, result: summarizeObservations(observations) };
  }

  async function list(req, res) {
    const session = await guard(req, res, "analytics.read");
    if (!session) return;
    try {
      const { rows } = await pool.query(
        `SELECT e.id, e.protocol, e.hypothesis, e.description, e.variant_a, e.variant_b,
                e.metric_name, e.status, e.privacy_note, e.data_minimization_note,
                e.approved_by_identity, e.approved_at, e.execution_started_at,
                e.completed_at, e.cancelled_at, e.archived_at, e.created_by_identity,
                e.created_at, e.updated_at,
                (SELECT count(*)::int FROM ext_analytics_observations o WHERE o.experiment_id=e.id) AS observations_count,
                (SELECT count(*)::int FROM ext_analytics_experiment_events ev WHERE ev.experiment_id=e.id) AS events_count
           FROM ext_analytics_experiments e
          WHERE e.origin = 'ext11_canonica'
          ORDER BY e.created_at DESC
          LIMIT 200`,
      );
      return json(res, 200, {
        items: rows,
        note: "Somente experimentos canônicos; resultados dependem de observações reais internas e não incluem significância ou vencedor inventado.",
      });
    } catch (error) {
      console.error("EXT-11 list error", error?.message || error);
      return json(res, 500, { error: "database_error" });
    }
  }

  async function detail(req, res, id) {
    const session = await guard(req, res, "analytics.read");
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_experiment_id" });
    try {
      const result = await detailData(pool, id);
      return result ? json(res, 200, result) : json(res, 404, { error: "experiment_not_found" });
    } catch (error) {
      console.error("EXT-11 detail error", error?.message || error);
      return json(res, 500, { error: "database_error" });
    }
  }

  async function create(req, res) {
    const session = await guard(req, res, "analytics.write", { write: true });
    if (!session) return;
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const hypothesis = text(body.hypothesis, 20, 2000);
    const description = text(body.description, 10, 2000);
    const variantA = text(body.variant_a, 3, 200);
    const variantB = text(body.variant_b, 3, 200);
    const metricName = text(body.metric_name, 3, 100);
    const privacyNote = text(body.privacy_note, 10, 500) || "Experimento interno reversível; nenhum identificador direto é coletado.";
    const minimization = text(body.data_minimization_note, 10, 1000) || "Somente métrica agregada necessária; sem nome, contato, IP ou identificador direto.";
    if (!hypothesis) return json(res, 400, { error: "invalid_hypothesis" });
    if (!description) return json(res, 400, { error: "invalid_description" });
    if (!variantA || !variantB || variantA === variantB) return json(res, 400, { error: "invalid_variants" });
    if (!metricName) return json(res, 400, { error: "invalid_metric_name" });
    if (body.is_privacy_compliant === false || body.collect_identifiers === true) return json(res, 400, { error: "privacy_minimization_required" });

    const fp = fingerprint({ op: "create", hypothesis, description, variantA, variantB, metricName, privacyNote, minimization });
    return mutation(res, {
      session,
      key,
      fp,
      action: "analytics_experiment_create",
      replay: async (client, previous) => ({ experiment: await getExperiment(client, previous.experiment_id) }),
      work: async (client) => {
        const inserted = await client.query(
          `INSERT INTO ext_analytics_experiments
             (protocol, hypothesis, description, variant_a, variant_b, metric_name,
              status, is_privacy_compliant, privacy_note, data_minimization_note,
              origin, idempotency_key, request_fingerprint, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,'rascunho',true,$7,$8,'ext11_canonica',$9,$10,$11)
           RETURNING *`,
          [protocol(), hypothesis, description, variantA, variantB, metricName, privacyNote, minimization, key, fp, session.identityId],
        );
        const experiment = inserted.rows[0];
        await event(client, {
          experimentId: experiment.id,
          eventType: "experiment_created",
          summary: "Experimento criado como rascunho; ainda não está em execução.",
          payload: { protocol: experiment.protocol, metric_name: metricName, privacy_minimized: true },
          key,
          fp,
          identityId: session.identityId,
        });
        return { experimentId: experiment.id, target: experiment.id, statusCode: 201, response: { experiment: publicExperiment(experiment) } };
      },
    });
  }

  async function approve(req, res, id) {
    const session = await guard(req, res, "analytics.approve", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_experiment_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const approvalNote = text(parsed.value.approval_note, 10, 1000);
    if (!approvalNote) return json(res, 400, { error: "approval_note_required" });
    const fp = fingerprint({ op: "approve", id, approvalNote });
    return mutation(res, {
      session,
      key,
      fp,
      action: "analytics_experiment_approve",
      replay: async (client, previous) => ({ experiment: await getExperiment(client, previous.experiment_id) }),
      work: async (client) => {
        const existing = await client.query(
          `SELECT * FROM ext_analytics_experiments WHERE id=$1 AND origin='ext11_canonica' FOR UPDATE`,
          [id],
        );
        if (!existing.rows[0]) return { error: "experiment_not_found", status: 404 };
        if (existing.rows[0].status !== "rascunho") return { error: "approval_only_in_draft", status: 409 };
        const updated = await client.query(
          `UPDATE ext_analytics_experiments
              SET approved_by_identity=$2, approved_at=NOW(), approval_note=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, session.identityId, approvalNote],
        );
        await event(client, {
          experimentId: id,
          eventType: "experiment_approved",
          summary: "Aprovação humana registrada; execução ainda depende da transição controlada.",
          payload: { approved_by_identity: session.identityId },
          key,
          fp,
          identityId: session.identityId,
        });
        return { experimentId: id, target: id, response: { experiment: publicExperiment(updated.rows[0]) } };
      },
    });
  }

  async function transition(req, res, id) {
    const session = await guard(req, res, "analytics.execute", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_experiment_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const next = text(body.status, 5, 30);
    const justification = body.justification === undefined ? null : text(body.justification, 5, 2000);
    const conclusionNote = body.conclusion_note === undefined ? null : text(body.conclusion_note, 10, 2000);
    if (!next || !STATUSES.has(next)) return json(res, 400, { error: "invalid_status" });
    if (["cancelado", "arquivado", "rascunho"].includes(next) && body.justification !== undefined && !justification) return json(res, 400, { error: "invalid_justification" });
    if (next === "concluido" && !conclusionNote) return json(res, 400, { error: "conclusion_note_required" });
    const fp = fingerprint({ op: "transition", id, next, justification, conclusionNote });
    return mutation(res, {
      session,
      key,
      fp,
      action: `analytics_experiment_transition_${next}`,
      replay: async (client, previous) => ({ experiment: await getExperiment(client, previous.experiment_id) }),
      work: async (client) => {
        const existing = await client.query(
          `SELECT * FROM ext_analytics_experiments WHERE id=$1 AND origin='ext11_canonica' FOR UPDATE`,
          [id],
        );
        if (!existing.rows[0]) return { error: "experiment_not_found", status: 404 };
        const current = existing.rows[0];
        if (!(TRANSITIONS[current.status] || []).includes(next)) return { error: "invalid_transition", status: 409 };
        if (next === "em_execucao" && (!current.approved_by_identity || !current.approved_at)) return { error: "approval_required", status: 409 };
        if (next === "concluido") {
          const observations = await client.query(
            `SELECT count(*) FILTER (WHERE variant='A')::int AS a,
                    count(*) FILTER (WHERE variant='B')::int AS b
               FROM ext_analytics_observations WHERE experiment_id=$1`,
            [id],
          );
          const counts = observations.rows[0];
          if (!counts || counts.a < 1 || counts.b < 1) return { error: "insufficient_real_observations", status: 409, message: "Conclusão exige observação real de A e B." };
        }
        const updated = await client.query(
          `UPDATE ext_analytics_experiments
              SET status=$2::ext_analytics_status,
                  execution_started_at=CASE WHEN $2::text='em_execucao' THEN COALESCE(execution_started_at,NOW()) ELSE execution_started_at END,
                  completed_at=CASE WHEN $2::text='concluido' THEN NOW() ELSE completed_at END,
                  cancelled_at=CASE WHEN $2::text='cancelado' THEN NOW() ELSE cancelled_at END,
                  archived_at=CASE WHEN $2::text='arquivado' THEN NOW() ELSE archived_at END,
                  conclusion_note=CASE WHEN $2::text='concluido' THEN $3 ELSE conclusion_note END,
                  updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, next, conclusionNote],
        );
        await event(client, {
          experimentId: id,
          eventType: `experiment_status_${next}`,
          summary: `Estado alterado para ${next}; resultados continuam limitados a dados reais registrados.`,
          payload: { from: current.status, to: next, justification, has_conclusion_note: Boolean(conclusionNote) },
          key,
          fp,
          identityId: session.identityId,
        });
        return { experimentId: id, target: id, response: { experiment: publicExperiment(updated.rows[0]) } };
      },
    });
  }

  async function observation(req, res, id) {
    const session = await guard(req, res, "analytics.write", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_experiment_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const variant = body.variant === "A" || body.variant === "B" ? body.variant : null;
    const metricValue = typeof body.metric_value === "number" ? body.metric_value : Number(body.metric_value);
    const sampleSize = Number(body.sample_size);
    const sourceType = text(body.source_type, 3, 60);
    const sourceReference = text(body.source_reference, 3, 500);
    const sourceRecordedAt = text(body.source_recorded_at, 10, 80);
    const sourceRecordId = body.source_record_id === undefined || body.source_record_id === null ? null : String(body.source_record_id);
    if (!variant) return json(res, 400, { error: "invalid_variant" });
    if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > 1e15) return json(res, 400, { error: "invalid_metric_value" });
    if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 1_000_000_000) return json(res, 400, { error: "invalid_sample_size" });
    if (!sourceType || !SOURCE_TYPES.has(sourceType) || !sourceReference || /synthetic|invented|fake|mock|fixture/i.test(sourceReference)) return json(res, 400, { error: "real_source_required" });
    const recordedAt = new Date(sourceRecordedAt);
    if (!sourceRecordedAt || Number.isNaN(recordedAt.valueOf()) || recordedAt > new Date()) return json(res, 400, { error: "invalid_source_recorded_at" });
    if (sourceRecordId !== null && !UUID.test(sourceRecordId)) return json(res, 400, { error: "invalid_source_record_id" });
    if (body.is_synthetic === true || body.synthetic === true || body.result !== undefined || body.winner !== undefined || body.significance !== undefined) return json(res, 400, { error: "observation_must_be_real_source" });

    const fp = fingerprint({ op: "observation", id, variant, metricValue, sampleSize, sourceType, sourceReference, sourceRecordedAt, sourceRecordId });
    return mutation(res, {
      session,
      key,
      fp,
      action: "analytics_observation_create",
      replay: async (client, previous) => ({ observation: (await client.query("SELECT * FROM ext_analytics_observations WHERE id=$1", [previous.payload.observation_id])).rows[0] }),
      work: async (client) => {
        const existing = await client.query(
          `SELECT id, status, metric_name FROM ext_analytics_experiments WHERE id=$1 AND origin='ext11_canonica' FOR UPDATE`,
          [id],
        );
        if (!existing.rows[0]) return { error: "experiment_not_found", status: 404 };
        if (existing.rows[0].status !== "em_execucao") return { error: "experiment_not_running", status: 409 };
        if (existing.rows[0].metric_name !== text(body.metric_name, 3, 100)) return { error: "metric_mismatch", status: 400 };
        const inserted = await client.query(
          `INSERT INTO ext_analytics_observations
             (experiment_id, variant, metric_name, metric_value, sample_size, source_type,
              source_reference, source_recorded_at, source_record_id, recorded_by_identity,
              idempotency_key, request_fingerprint, is_synthetic)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
           RETURNING id, experiment_id, variant, metric_name, metric_value, sample_size,
                     source_type, source_reference, source_recorded_at, source_record_id,
                     recorded_by_identity, created_at`,
          [id, variant, body.metric_name.trim(), metricValue, sampleSize, sourceType, sourceReference, recordedAt.toISOString(), sourceRecordId, session.identityId, key, fp],
        );
        const row = inserted.rows[0];
        await event(client, {
          experimentId: id,
          eventType: "observation_recorded",
          summary: "Observação agregada registrada a partir de origem operacional declarada.",
          payload: { observation_id: row.id, variant, sample_size: sampleSize, source_type: sourceType },
          key,
          fp,
          identityId: session.identityId,
        });
        return { experimentId: id, target: id, response: { observation: row, note: "Dado observado; nenhuma conclusão ou significância foi inventada." }, statusCode: 201 };
      },
    });
  }

  async function legacy(req, res) {
    const write = req.method !== "GET" && req.method !== "HEAD";
    const session = await guard(req, res, write ? "analytics.write" : "analytics.read", { write });
    if (!session) return;
    if (write) {
      return json(res, 410, { error: "legacy_writer_retired", canonical: "/api/ext/analytics/experiments" });
    }
    // Leitura histórica legada continua autorizada para compatibilidade; não
    // é a fonte da jornada F07 e jamais preenche resultados canônicos.
    try {
      const { rows } = await pool.query(
        `SELECT *
           FROM ext_analytics_experiments
          WHERE origin = 'registro_legado'
          ORDER BY created_at DESC LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Escritas legadas aposentadas; use a rota canônica." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  return {
    handle: async (req, res) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      let match = pathname.match(/^\/api\/ext\/analytics\/experiments(?:\/([^/]+))?(?:\/(approve|transition|observations))?$/);
      if (!match) return json(res, 404, { error: "not_found" });
      const id = match[1];
      const action = match[2];
      if (!id && req.method === "GET") return list(req, res);
      if (!id && req.method === "POST") return create(req, res);
      if (id && !action && req.method === "GET") return detail(req, res, id);
      if (id && action === "approve" && req.method === "POST") return approve(req, res, id);
      if (id && action === "transition" && (req.method === "POST" || req.method === "PATCH")) return transition(req, res, id);
      if (id && action === "observations" && req.method === "POST") return observation(req, res, id);
      return json(res, 405, { error: "method_not_allowed" });
    },
    handleLegacy: legacy,
  };
}
