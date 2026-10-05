// EXT-14 / F10 — Inteligência comercial canônica.
//
// Indicações, reativações e recomendações explicadas com evidência contada de
// tabelas internas reais dentro de uma janela de histórico declarada. O
// contato exige aprovação humana anterior e é registrado internamente: nada
// é enviado a cliente, fornecedor ou canal externo; os handlers legados não
// contam como cobertura da jornada.
import { createHash } from "node:crypto";
import { hasPermission } from "./rbac.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = new Set(["sugerida", "em_analise", "aprovada", "rejeitada", "contato_registrado", "arquivada"]);
const TRANSITIONS = Object.freeze({
  sugerida: ["em_analise", "arquivada"],
  em_analise: ["sugerida", "aprovada", "rejeitada", "arquivada"],
  aprovada: ["em_analise", "arquivada"],
  rejeitada: ["em_analise", "arquivada"],
  contato_registrado: ["arquivada"],
  arquivada: ["sugerida"],
});

// Fontes internas reais por tipo de sugestão. Cada evidência é um COUNT sobre
// a tabela indicada dentro da janela de histórico; nada é estimado ou
// inventado e o tipo 'outro' é recusado por não ter fonte confirmada.
export const INTEL_SOURCES = Object.freeze({
  indicacao: Object.freeze(["public_leads", "crm_contacts"]),
  reativacao: Object.freeze(["client_tickets", "crm_contacts"]),
  upsell: Object.freeze(["fin_accounts_receivable", "fin_payments"]),
  cross_sell: Object.freeze(["crm_contacts", "ext_satisfaction_surveys"]),
  risco: Object.freeze(["client_tickets", "ext_quality_nonconformities"]),
  oportunidade: Object.freeze(["public_leads", "crm_contacts"]),
});

const text = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max
    ? value.trim()
    : null;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const fingerprint = (payload) => createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");

const isoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

// Snapshot puro de evidência: cada entrada referencia a tabela-fonte interna
// e o COUNT da janela declarada. Fronteira declarada: nenhum contato externo.
export function buildEvidenceSnapshot({ intelType, historyStart, historyEnd, counts }) {
  const sources = {};
  let totalRecords = 0;
  for (const table of INTEL_SOURCES[intelType] || []) {
    const count = Number(counts?.[table] ?? 0);
    sources[table] = count;
    totalRecords += count;
  }
  return {
    intel_type: intelType,
    history_start: historyStart,
    history_end: historyEnd,
    sources,
    total_records: totalRecords,
    method: "COUNT(*) por tabela-fonte interna com created_at dentro da janela de histórico",
    boundary: "evidência contada de tabelas internas reais; nenhum contato externo é feito e nada é estimado ou inventado",
  };
}

export function createExtIntelApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    });
    res.end(JSON.stringify(body));
  };

  async function guard(req, res, permission, { write = false } = {}) {
    let session = null;
    try { session = await requireSession(req); } catch {}
    if (!session?.identityId || !UUID.test(String(session.identityId))) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
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
      if (raw.length > 64 * 1024) return { error: "payload_too_large", status: 413 };
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

  async function recordEvent(client, { intelId, eventType, summary, payload, key, fp, identityId }) {
    await client.query(
      `INSERT INTO ext_intel_events
         (intel_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [intelId, eventType, summary, JSON.stringify(payload || {}), key, fp, identityId],
    );
  }

  async function mutate(res, { session, key, fp, action, work, replay }) {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext-intel-${session.identityId}-${key}`]);
      const previous = await client.query(
        `SELECT * FROM ext_intel_events
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
          [session.identityId, action, result.target || result.intel?.id || "intel"],
        );
      } catch (auditError) {
        await client.query("ROLLBACK");
        console.error("EXT-14 audit unavailable", auditError?.message || auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, result.statusCode || 200, result.response);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-14 mutation error", error?.message || error);
      return json(res, 500, { error: "internal_error" });
    } finally {
      client?.release();
    }
  }

  async function intelById(clientOrPool, id, { lock = false } = {}) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM ext_commercial_intelligence WHERE id=$1 AND origin='ext14_canonica'${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return rows[0] || null;
  }

  async function intelDetail(clientOrPool, id) {
    const intel = await intelById(clientOrPool, id);
    if (!intel) return null;
    const events = (await clientOrPool.query(
      `SELECT id, event_type, summary, payload, created_by_identity, created_at
         FROM ext_intel_events
        WHERE intel_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    return { intel, events };
  }

  async function listSuggestions(req, res) {
    const session = await guard(req, res, "intel.read");
    if (!session) return;
    try {
      const { rows } = await pool.query(
        `SELECT id, protocol, title, intel_type, status, history_start, history_end,
                evidence, evidence_fingerprint, evidence_built_at, is_human_approved,
                approved_by_identity, approved_at, contact_registered_at,
                related_client_account_id, created_by_identity, created_at, updated_at
           FROM ext_commercial_intelligence
          WHERE origin='ext14_canonica'
          ORDER BY created_at DESC
          LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Sugestões canônicas EXT-14; contato é registro interno autorizado, sem mensagem externa." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function createSuggestion(req, res) {
    const session = await guard(req, res, "intel.write", { write: true });
    if (!session) return;
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const title = text(body.title, 5, 200);
    const intelType = typeof body.intel_type === "string" ? body.intel_type.trim() : "";
    const description = text(body.description, 10, 2000);
    const justification = text(body.justification, 10, 1000);
    const sourceModule = text(body.source_module, 3, 100) || "historico_interno";
    const historyStart = isoDate(body.history_start);
    const historyEnd = isoDate(body.history_end);
    const relatedClientAccountId = body.related_client_account_id === undefined || body.related_client_account_id === null
      ? null
      : (typeof body.related_client_account_id === "string" && UUID.test(body.related_client_account_id) ? body.related_client_account_id : false);
    if (!title) return json(res, 400, { error: "invalid_title" });
    if (!INTEL_SOURCES[intelType]) return json(res, 400, { error: "invalid_intel_type", message: "Tipos aceitos: " + Object.keys(INTEL_SOURCES).join(", ") });
    if (!description) return json(res, 400, { error: "invalid_description" });
    if (!justification) return json(res, 400, { error: "justification_required", message: "Toda sugestão precisa ser explicada (10 a 1000 caracteres)." });
    if (!historyStart || !historyEnd || historyEnd < historyStart) return json(res, 400, { error: "invalid_history_window" });
    if (relatedClientAccountId === false) return json(res, 400, { error: "invalid_related_client_account_id" });
    const fp = fingerprint({ op: "intel_create", title, intelType, description, justification, sourceModule, historyStart, historyEnd, relatedClientAccountId });
    return mutate(res, {
      session, key, fp, action: "intel_create",
      replay: async (client, event) => ({ intel: (await client.query("SELECT * FROM ext_commercial_intelligence WHERE id=$1", [event.intel_id])).rows[0] }),
      work: async (client) => {
        if (relatedClientAccountId) {
          const client_row = await client.query("SELECT id FROM client_accounts WHERE id=$1", [relatedClientAccountId]);
          if (!client_row.rows[0]) return { error: "client_account_not_found", status: 409 };
        }
        const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
        const protocol = `INTEL-EXT-${stamp}-${fp.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`;
        const inserted = await client.query(
          `INSERT INTO ext_commercial_intelligence
             (protocol, intel_type, title, description, justification, source_module,
              related_client_account_id, status, origin, created_by_identity,
              idempotency_key, request_fingerprint, history_start, history_end)
           VALUES ($1,$2::ext_intel_type,$3,$4,$5,$6,$7,'sugerida','ext14_canonica',$8,$9,$10,$11,$12)
           ON CONFLICT (protocol) DO NOTHING
           RETURNING *`,
          [protocol, intelType, title, description, justification, sourceModule, relatedClientAccountId, session.identityId, key, fp, historyStart, historyEnd],
        );
        if (!inserted.rows[0]) return { error: "protocol_conflict_retry", status: 409 };
        const intel = inserted.rows[0];
        await recordEvent(client, { intelId: intel.id, eventType: "intel_suggested", summary: justification, payload: { protocol, intel_type: intelType, history_start: historyStart, history_end: historyEnd, source_module: sourceModule }, key, fp, identityId: session.identityId });
        return { intel, target: intel.id, response: { intel }, statusCode: 201 };
      },
    });
  }

  async function transitionSuggestion(req, res, id) {
    const session = await guard(req, res, "intel.review", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_intel_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const next = text(parsed.value.status, 5, 30);
    const note = text(parsed.value.decision_note, 10, 1000) || text(parsed.value.justification, 10, 1000);
    if (!next || !STATUS.has(next) || next === "contato_registrado") return json(res, 400, { error: "invalid_status" });
    const fp = fingerprint({ op: "intel_transition", id, next, note: note || null });
    return mutate(res, {
      session, key, fp, action: "intel_transition",
      replay: async (client, event) => ({ intel: (await client.query("SELECT * FROM ext_commercial_intelligence WHERE id=$1", [event.intel_id])).rows[0] }),
      work: async (client) => {
        const intel = await intelById(client, id, { lock: true });
        if (!intel) return { error: "intel_not_found", status: 404 };
        if (!(TRANSITIONS[intel.status] || []).includes(next)) return { error: "invalid_transition", status: 409 };
        if (["aprovada", "rejeitada", "arquivada"].includes(next) && !note) return { error: "justification_required", status: 400 };
        if (next === "aprovada" && !intel.evidence_fingerprint) return { error: "evidence_required", status: 409, message: "Aprovação exige evidência contada do histórico interno antes da decisão humana." };
        const updated = await client.query(
          `UPDATE ext_commercial_intelligence
              SET status=$2::ext_intel_status,
                  is_human_approved = CASE WHEN $2::text='aprovada' THEN true ELSE is_human_approved END,
                  approved_by_identity = CASE WHEN $2::text='aprovada' THEN $3::uuid ELSE approved_by_identity END,
                  approved_at = CASE WHEN $2::text='aprovada' THEN NOW() ELSE approved_at END,
                  decision_note = CASE WHEN $2::text IN ('aprovada','rejeitada','arquivada') THEN $4 ELSE decision_note END,
                  updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, next, session.identityId, note],
        );
        await recordEvent(client, { intelId: id, eventType: `intel_${next}`, summary: `Sugestão de inteligência comercial alterada para ${next}.`, payload: { from: intel.status, to: next, note: note || null }, key, fp, identityId: session.identityId });
        return { intel: updated.rows[0], target: id, response: { intel: updated.rows[0] } };
      },
    });
  }

  async function buildEvidence(req, res, id) {
    const session = await guard(req, res, "intel.write", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_intel_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.evidence_note, 5, 1000) || "Evidência contada das tabelas-fonte internas da janela declarada.";
    const fp = fingerprint({ op: "intel_evidence", id, note });
    return mutate(res, {
      session, key, fp, action: "intel_evidence_build",
      replay: async (client, event) => ({ intel: (await client.query("SELECT * FROM ext_commercial_intelligence WHERE id=$1", [event.intel_id])).rows[0] }),
      work: async (client) => {
        const intel = await intelById(client, id, { lock: true });
        if (!intel) return { error: "intel_not_found", status: 404 };
        if (!["sugerida", "em_analise"].includes(intel.status)) return { error: "invalid_status_for_evidence", status: 409 };
        const window = (await client.query(
          `SELECT history_start::text AS history_start, history_end::text AS history_end
             FROM ext_commercial_intelligence WHERE id=$1`,
          [id],
        )).rows[0];
        const counts = {};
        for (const table of INTEL_SOURCES[intel.intel_type] || []) {
          const counted = await client.query(
            `SELECT count(*)::int AS n FROM ${table}
              WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
            [window.history_start, window.history_end],
          );
          counts[table] = counted.rows[0].n;
        }
        const evidence = buildEvidenceSnapshot({
          intelType: intel.intel_type,
          historyStart: window.history_start,
          historyEnd: window.history_end,
          counts,
        });
        const evidenceFp = fingerprint({ op: "intel_evidence_snapshot", id, evidence });
        const updated = await client.query(
          `UPDATE ext_commercial_intelligence
              SET evidence=$2, evidence_fingerprint=$3, evidence_built_at=NOW(),
                  evidence_built_by_identity=$4, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, JSON.stringify(evidence), evidenceFp, session.identityId],
        );
        await recordEvent(client, { intelId: id, eventType: "intel_evidence_built", summary: note, payload: { evidence, evidence_fingerprint: evidenceFp }, key, fp, identityId: session.identityId });
        return { intel: updated.rows[0], target: id, response: { intel: updated.rows[0], evidence, note: "Evidência contada de fontes internas reais; nenhum contato externo foi feito." } };
      },
    });
  }

  async function registerContact(req, res, id) {
    const session = await guard(req, res, "intel.contact", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_intel_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.contact_note, 10, 1000);
    if (!note) return json(res, 400, { error: "contact_note_required" });
    const fp = fingerprint({ op: "intel_contact", id, note });
    return mutate(res, {
      session, key, fp, action: "intel_contact_register",
      replay: async (client, event) => ({ intel: (await client.query("SELECT * FROM ext_commercial_intelligence WHERE id=$1", [event.intel_id])).rows[0] }),
      work: async (client) => {
        const intel = await intelById(client, id, { lock: true });
        if (!intel) return { error: "intel_not_found", status: 404 };
        if (intel.status !== "aprovada" || !intel.is_human_approved || !intel.approved_by_identity) return { error: "approval_required", status: 409, message: "O contato só pode ser registrado após aprovação humana explícita." };
        const updated = await client.query(
          `UPDATE ext_commercial_intelligence
              SET status='contato_registrado', contact_registered_at=NOW(),
                  contact_registered_by_identity=$2, contact_note=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, session.identityId, note],
        );
        await recordEvent(client, { intelId: id, eventType: "intel_contact_registered", summary: note, payload: { approved_by_identity: intel.approved_by_identity, boundary: "registro interno autorizado; nenhum contato externo foi feito (e-mail/telefone pendentes)" }, key, fp, identityId: session.identityId });
        return { intel: updated.rows[0], target: id, response: { intel: updated.rows[0], note: "Contato registrado internamente após aprovação humana; nenhuma mensagem externa foi disparada." } };
      },
    });
  }

  async function detailSuggestion(req, res, id) {
    const session = await guard(req, res, "intel.read");
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_intel_id" });
    try {
      const detail = await intelDetail(pool, id);
      return detail ? json(res, 200, detail) : json(res, 404, { error: "intel_not_found" });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function legacy(req, res) {
    const write = req.method !== "GET" && req.method !== "HEAD";
    const session = await guard(req, res, write ? "intel.write" : "intel.read", { write });
    if (!session) return;
    if (write) {
      return json(res, 410, {
        error: "legacy_writer_retired",
        canonical: "/api/ext/intel/suggestions",
      });
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, protocol, title, intel_type, status, is_human_approved,
                approved_at, created_at
           FROM ext_commercial_intelligence
          WHERE origin='registro_legado'
          ORDER BY created_at DESC LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Leitura legada minimizada; escritas foram aposentadas." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  return {
    handle: async (req, res) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const match = pathname.match(/^\/api\/ext\/intel\/suggestions(?:\/([^/]+))?(?:\/(transition|evidence|contact))?$/);
      if (!match) return json(res, 404, { error: "not_found" });
      const id = match[1];
      const action = match[2];
      if (!id && req.method === "GET") return listSuggestions(req, res);
      if (!id && req.method === "POST") return createSuggestion(req, res);
      if (id && !action && req.method === "GET") return detailSuggestion(req, res, id);
      if (id && action === "transition" && (req.method === "POST" || req.method === "PATCH")) return transitionSuggestion(req, res, id);
      if (id && action === "evidence" && req.method === "POST") return buildEvidence(req, res, id);
      if (id && action === "contact" && req.method === "POST") return registerContact(req, res, id);
      return json(res, 405, { error: "method_not_allowed" });
    },
    handleLegacy: (req, res) => legacy(req, res),
  };
}
