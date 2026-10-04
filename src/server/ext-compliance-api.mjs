// EXT-07 — Compliance Corporativo Canônico.
// Jornada interna de staff com obrigações, documentos/referências privadas e tarefas de vencimento.
// Sem fake upload, sem bytes não verificados, projeção de metadados minimizada e atomicidade estrita.

import { createHash, randomBytes, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const STAFF_ROLES = ["admin", "ti", "marcelo"];
const VALID_COMPLIANCE_TYPES = ["licenca", "certidao", "seguro", "alvara", "outro"];
const VALID_CRITICALITIES = ["baixa", "media", "alta", "critica"];

const hash = (v) => createHash("sha256").update(JSON.stringify(v, Object.keys(v).sort())).digest("hex");
const txt = (v, min, max) => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const generateProtocol = () => {
  const d = new Date();
  const y = d.getUTCFullYear().toString();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `COMP-EXT-${y}${m}${day}-${rand}`;
};

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, value) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(value));
  };

  const getRole = (s) => String(s?.role || s?.userRole || "").toLowerCase();

  async function staffGuard(req, res, write = false) {
    let s;
    try {
      s = await requireSession(req);
    } catch {}
    if (!s) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    if (!STAFF_ROLES.includes(getRole(s))) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    if (write && !sameOrigin(req)) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    if (write && !UUID.test(String(s.identityId || ""))) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    return s;
  }

  async function readBody(req, res) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 65536) {
        json(res, 413, { error: "body_too_large" });
        return null;
      }
      chunks.push(c);
    }
    try {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return {};
      const b = JSON.parse(raw);
      if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("not_an_object");
      return b;
    } catch {
      json(res, 400, { error: "invalid_json" });
      return null;
    }
  }

  function getIdempotencyKey(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(key)) {
      json(res, 400, { error: "idempotency_key_required" });
      return null;
    }
    return key;
  }

  async function activeStaffIdentity(client, id) {
    if (!UUID.test(String(id || ""))) return false;
    const q = await client.query(
      `SELECT i.id FROM auth_identities i
       JOIN auth_staff_profiles p ON p.identity_id = i.id
       WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active'`,
      [id]
    );
    return Boolean(q.rows[0]);
  }

  async function mutate(res, { identity, key, fingerprint, auditAction, target, obligationId, documentId, taskId, eventType, replay, work }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${identity}:${key}`]);

      const prior = (
        await client.query(
          "SELECT * FROM ext_compliance_events WHERE created_by_identity = $1 AND idempotency_key = $2",
          [identity, key]
        )
      ).rows[0];

      if (prior) {
        if (prior.request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        const replayPayload = replay ? await replay(client, prior) : prior.payload;
        await client.query("COMMIT");
        return json(res, 200, { ...replayPayload, replayed: true });
      }

      const out = await work(client);
      if (out.deny) {
        await client.query("ROLLBACK");
        return json(res, out.deny.status, out.deny.body);
      }

      await client.query(
        `INSERT INTO ext_compliance_events(obligation_id, document_id, task_id, event_type, payload, idempotency_key, request_fingerprint, created_by_identity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          out.obligationId || obligationId || null,
          out.documentId || documentId || null,
          out.taskId || taskId || null,
          out.eventType || eventType,
          JSON.stringify(out.body || {}),
          key,
          fingerprint,
          identity,
        ]
      );

      try {
        await client.query(
          `INSERT INTO audit_log(action, actor, target, meta) VALUES ($1, $2, $3, $4)`,
          [
            out.auditAction || auditAction,
            identity,
            out.target || target || identity,
            JSON.stringify(out.auditMeta || {}),
          ]
        );
      } catch (auditErr) {
        await client.query("ROLLBACK");
        console.error("EXT-07 audit_log failed", auditErr?.message || auditErr);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, out.status || 200, out.body);
    } catch (e) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-07 mutation failed", e?.message || e);
      return json(res, e.code === "23505" ? 409 : 503, {
        error: e.code === "23505" ? "conflict" : "compliance_journey_unavailable",
      });
    } finally {
      client?.release();
    }
  }

  // --- Handlers ---

  async function listObligations(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const s = await staffGuard(req, res);
    if (!s) return;

    try {
      const q = await pool.query(
        `SELECT o.id, o.obligation_type, o.title, o.description, o.declared_source,
                o.applicability_scope, o.applicability_justification, o.validity_rule,
                o.renewal_lead_days, o.criticality, o.status, o.responsible_identity,
                i.display_name AS responsible_name, o.created_at, o.updated_at,
                (SELECT d.id FROM ext_compliance_documents d WHERE d.obligation_id = o.id AND d.origin = 'ext07_canonica' AND d.status IN ('vigente','a_vencer') LIMIT 1) AS active_document_id,
                (SELECT d.protocol FROM ext_compliance_documents d WHERE d.obligation_id = o.id AND d.origin = 'ext07_canonica' AND d.status IN ('vigente','a_vencer') LIMIT 1) AS active_document_protocol,
                (SELECT d.expiry_date FROM ext_compliance_documents d WHERE d.obligation_id = o.id AND d.origin = 'ext07_canonica' AND d.status IN ('vigente','a_vencer') LIMIT 1) AS active_document_expiry_date
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id = o.responsible_identity
         ORDER BY o.created_at DESC
         LIMIT 200`
      );

      return json(res, 200, {
        obligations: q.rows,
        items: q.rows,
        source: "ext_compliance_obligations",
        period: null,
        denominator: q.rows.length,
        absence_is_not_zero: q.rows.length === 0,
        empty_state: q.rows.length ? null : "Nenhuma obrigação canônica no backend.",
      });
    } catch {
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function createObligation(req, res) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const s = await staffGuard(req, res, true);
    if (!s) return;

    const b = await readBody(req, res);
    const key = b && getIdempotencyKey(req, res);
    if (!b || !key) return;

    const title = txt(b.title, 5, 200);
    const description = txt(b.description, 10, 2000);
    const source = txt(b.declared_source, 5, 1000);
    const scope = txt(b.applicability_scope, 3, 500);
    const just = txt(b.applicability_justification, 10, 2000);
    const rule = txt(b.validity_rule, 5, 500);
    const obType = txt(b.obligation_type || "outro", 3, 100);
    const leadDays = Number.isInteger(b.renewal_lead_days) && b.renewal_lead_days >= 0 && b.renewal_lead_days <= 3650 ? b.renewal_lead_days : 30;
    const crit = VALID_CRITICALITIES.includes(b.criticality) ? b.criticality : "media";
    const rid = b.responsible_identity;

    if (!title || !description || !source || !scope || !just || !rule || !rid || !UUID.test(String(rid))) {
      return json(res, 400, { error: "invalid_obligation" });
    }

    const fingerprint = hash({ op: "create_obligation", obType, title, description, source, scope, just, rule, leadDays, crit, rid });

    return mutate(res, {
      identity: s.identityId,
      key,
      fingerprint,
      auditAction: "ext07_obligation_create",
      replay: async (c, prior) => ({ obligation: prior.payload.obligation }),
      work: async (c) => {
        if (!(await activeStaffIdentity(c, rid))) {
          return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
        }

        const r = (
          await c.query(
            `INSERT INTO ext_compliance_obligations (
               obligation_type, title, description, declared_source, applicability_scope,
               applicability_justification, validity_rule, renewal_lead_days, criticality,
               status, responsible_identity, created_by_identity
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente', $10, $11)
             RETURNING *`,
            [obType, title, description, source, scope, just, rule, leadDays, crit, rid, s.identityId]
          )
        ).rows[0];

        return {
          status: 201,
          body: { obligation: r },
          obligationId: r.id,
          target: r.id,
          eventType: "obligation_created",
          auditMeta: { title: r.title, obligation_type: r.obligation_type },
        };
      },
    });
  }

  async function listDocuments(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const s = await staffGuard(req, res);
    if (!s) return;

    try {
      // Projeção minimizada: sem storage_key nem URLs de storage privadas
      const q = await pool.query(
        `SELECT d.id, d.protocol, d.title, d.description, d.compliance_type, d.status,
                d.obligation_id, d.origin, d.effective_start_date, d.issue_date, d.expiry_date,
                d.reference_type, d.declared_reference, d.reference_source, d.version_no,
                d.replacement_of, d.is_private, d.evaluation_date, d.created_at, d.updated_at,
                o.title AS obligation_title
         FROM ext_compliance_documents d
         LEFT JOIN ext_compliance_obligations o ON o.id = d.obligation_id
         WHERE d.origin = 'ext07_canonica'
         ORDER BY d.expiry_date ASC NULLS LAST, d.created_at DESC
         LIMIT 200`
      );

      return json(res, 200, {
        documents: q.rows,
        items: q.rows,
        source: "ext07_canonica",
        file_boundary: "referencia_declarada_nao_arquivo_verificado",
        denominator: q.rows.length,
        absence_is_not_zero: q.rows.length === 0,
      });
    } catch {
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function getDocumentDetail(req, res, id) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document_id" });
    const s = await staffGuard(req, res);
    if (!s) return;

    try {
      const doc = (
        await pool.query(
          `SELECT d.id, d.protocol, d.title, d.description, d.compliance_type, d.status,
                  d.obligation_id, d.origin, d.effective_start_date, d.issue_date, d.expiry_date,
                  d.reference_type, d.declared_reference, d.reference_source, d.version_no,
                  d.replacement_of, d.is_private, d.evaluation_date, d.created_at, d.updated_at,
                  o.title AS obligation_title, o.declared_source, o.validity_rule,
                  i.display_name AS responsible_name
           FROM ext_compliance_documents d
           LEFT JOIN ext_compliance_obligations o ON o.id = d.obligation_id
           LEFT JOIN auth_identities i ON i.id = d.responsible_identity
           WHERE d.id = $1 AND d.origin = 'ext07_canonica'`,
          [id]
        )
      ).rows[0];

      if (!doc) return json(res, 404, { error: "document_not_found" });

      const tasks = (
        await pool.query(
          `SELECT t.id, t.validity_period, t.rule, t.evaluation_date, t.due_date, t.status,
                  t.completion_result, t.cancellation_justification, t.created_at, t.completed_at,
                  i.display_name AS responsible_name
           FROM ext_compliance_tasks t
           LEFT JOIN auth_identities i ON i.id = t.responsible_identity
           WHERE t.document_id = $1
           ORDER BY t.created_at DESC`,
          [id]
        )
      ).rows;

      const events = (
        await pool.query(
          `SELECT e.id, e.event_type, e.created_at, i.display_name AS created_by_name
           FROM ext_compliance_events e
           LEFT JOIN auth_identities i ON i.id = e.created_by_identity
           WHERE e.document_id = $1
           ORDER BY e.created_at ASC`,
          [id]
        )
      ).rows;

      return json(res, 200, {
        document: doc,
        tasks,
        events,
        file_boundary: "referencia_declarada_nao_arquivo_verificado",
      });
    } catch {
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function createDocument(req, res) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const s = await staffGuard(req, res, true);
    if (!s) return;

    const b = await readBody(req, res);
    const key = b && getIdempotencyKey(req, res);
    if (!b || !key) return;

    const obId = String(b.obligation_id || "");
    if (!UUID.test(obId)) return json(res, 400, { error: "invalid_obligation" });

    const title = txt(b.title, 5, 200);
    const description = txt(b.description, 10, 2000);
    const cType = VALID_COMPLIANCE_TYPES.includes(b.compliance_type) ? b.compliance_type : "outro";
    const docNum = b.document_number ? txt(b.document_number, 3, 200) : null;
    const issuer = b.issuer ? txt(b.issuer, 3, 200) : null;
    const issueDate = isDay(b.issue_date) ? b.issue_date : null;
    const startDate = b.effective_start_date ? (isDay(b.effective_start_date) ? b.effective_start_date : null) : issueDate;
    const expiryDate = isDay(b.expiry_date) ? b.expiry_date : null;
    const refType = txt(b.reference_type || "referencia_declarada", 3, 100);
    const ref = txt(b.declared_reference, 3, 1000);
    const refSource = b.reference_source ? txt(b.reference_source, 3, 500) : null;

    if (!title || !description || !issueDate || !expiryDate || !ref || !refType || expiryDate < issueDate || (startDate && expiryDate < startDate) || (startDate && startDate < issueDate)) {
      return json(res, 400, { error: "invalid_validity" });
    }

    const fingerprint = hash({ op: "create_document", obId, title, description, cType, docNum, issuer, issueDate, startDate, expiryDate, refType, ref, refSource });

    return mutate(res, {
      identity: s.identityId,
      key,
      fingerprint,
      auditAction: "ext07_document_create",
      replay: async (c, prior) => ({ document: prior.payload.document, message: prior.payload.message }),
      work: async (c) => {
        const o = (
          await c.query(
            "SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE",
            [obId]
          )
        ).rows[0];

        if (!o) return { deny: { status: 404, body: { error: "obligation_not_found" } } };

        if (!(await activeStaffIdentity(c, o.responsible_identity))) {
          return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
        }

        // Verificar se já existe documento ativo vigente para a obrigação
        const existingActive = (
          await c.query(
            `SELECT id FROM ext_compliance_documents
             WHERE obligation_id = $1 AND origin = 'ext07_canonica' AND status::text IN ('vigente', 'a_vencer')`,
            [obId]
          )
        ).rows[0];

        if (existingActive) {
          return {
            deny: {
              status: 409,
              body: {
                error: "active_document_already_exists",
                message: "A obrigação já possui documento ativo; utilize a rota de renovação para substituir.",
              },
            },
          };
        }

        const protocol = generateProtocol();
        const r = (
          await c.query(
            `INSERT INTO ext_compliance_documents (
               protocol, title, description, compliance_type, status,
               document_number, issuer, responsible_name, responsible_identity,
               issue_date, effective_start_date, expiry_date, validity_rule,
               evaluation_date, reference_type, declared_reference, reference_source,
               is_private, created_by_identity, obligation_id, origin, version_no
             ) VALUES (
               $1, $2, $3, $4, 'vigente',
               $5, $6, $7, $8,
               $9, $10, $11, $12,
               CURRENT_DATE, $13, $14, $15,
               true, $16, $17, 'ext07_canonica', 1
             ) RETURNING id, protocol, title, status, obligation_id, origin, version_no,
                         issue_date, effective_start_date, expiry_date, reference_type,
                         declared_reference, is_private, created_at`,
            [
              protocol, title, description, cType,
              docNum, issuer, o.responsible_identity, o.responsible_identity,
              issueDate, startDate, expiryDate, o.validity_rule,
              refType, ref, refSource,
              s.identityId, o.id,
            ]
          )
        ).rows[0];

        // Atualizar estado da obrigação para vigente
        await c.query(
          "UPDATE ext_compliance_obligations SET status = 'vigente', updated_at = NOW() WHERE id = $1",
          [o.id]
        );

        return {
          status: 201,
          body: {
            document: r,
            message: "referência privada registrada; não representa arquivo armazenado ou verificado",
          },
          obligationId: o.id,
          documentId: r.id,
          target: r.id,
          eventType: "document_created",
          auditMeta: { protocol: r.protocol, obligation_id: o.id, expiry_date: expiryDate },
        };
      },
    });
  }

  async function renewDocument(req, res, id) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document_id" });
    const s = await staffGuard(req, res, true);
    if (!s) return;

    const b = await readBody(req, res);
    const key = b && getIdempotencyKey(req, res);
    if (!b || !key) return;

    const title = txt(b.title, 5, 200);
    const description = txt(b.description, 10, 2000);
    const cType = VALID_COMPLIANCE_TYPES.includes(b.compliance_type) ? b.compliance_type : "outro";
    const docNum = b.document_number ? txt(b.document_number, 3, 200) : null;
    const issuer = b.issuer ? txt(b.issuer, 3, 200) : null;
    const issueDate = isDay(b.issue_date) ? b.issue_date : null;
    const startDate = b.effective_start_date ? (isDay(b.effective_start_date) ? b.effective_start_date : null) : issueDate;
    const expiryDate = isDay(b.expiry_date) ? b.expiry_date : null;
    const refType = txt(b.reference_type || "referencia_declarada", 3, 100);
    const ref = txt(b.declared_reference, 3, 1000);
    const refSource = b.reference_source ? txt(b.reference_source, 3, 500) : null;
    const just = txt(b.justification || "Renovação periódica de conformidade.", 5, 1000);

    if (!title || !description || !issueDate || !expiryDate || !ref || !refType || !just || expiryDate < issueDate || (startDate && expiryDate < startDate) || (startDate && startDate < issueDate)) {
      return json(res, 400, { error: "invalid_validity" });
    }

    const fingerprint = hash({ op: "renew_document", id, title, description, cType, docNum, issuer, issueDate, startDate, expiryDate, refType, ref, refSource, just });

    return mutate(res, {
      identity: s.identityId,
      key,
      fingerprint,
      auditAction: "ext07_document_renew",
      replay: async (c, prior) => ({ document: prior.payload.document, message: prior.payload.message }),
      work: async (c) => {
        const prev = (
          await c.query(
            "SELECT * FROM ext_compliance_documents WHERE id = $1 AND origin = 'ext07_canonica' FOR UPDATE",
            [id]
          )
        ).rows[0];

        if (!prev) return { deny: { status: 404, body: { error: "document_not_found" } } };

        if (["cancelada", "substituida"].includes(prev.status)) {
          return { deny: { status: 409, body: { error: "document_already_terminal_or_replaced" } } };
        }

        const o = (
          await c.query(
            "SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE",
            [prev.obligation_id]
          )
        ).rows[0];

        if (!o) return { deny: { status: 404, body: { error: "obligation_not_found" } } };

        if (!(await activeStaffIdentity(c, o.responsible_identity))) {
          return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
        }

        // Marcar o documento anterior como substituída/renovada
        await c.query(
          "UPDATE ext_compliance_documents SET status = 'substituida', updated_at = NOW() WHERE id = $1",
          [prev.id]
        );

        const protocol = generateProtocol();
        const nextVersion = (prev.version_no || 1) + 1;

        const nextDoc = (
          await c.query(
            `INSERT INTO ext_compliance_documents (
               protocol, title, description, compliance_type, status,
               document_number, issuer, responsible_name, responsible_identity,
               issue_date, effective_start_date, expiry_date, validity_rule,
               evaluation_date, reference_type, declared_reference, reference_source,
               is_private, created_by_identity, obligation_id, origin,
               replacement_of, version_no
             ) VALUES (
               $1, $2, $3, $4, 'vigente',
               $5, $6, $7, $8,
               $9, $10, $11, $12,
               CURRENT_DATE, $13, $14, $15,
               true, $16, $17, 'ext07_canonica',
               $18, $19
             ) RETURNING id, protocol, title, status, obligation_id, origin, version_no,
                         replacement_of, issue_date, effective_start_date, expiry_date,
                         reference_type, declared_reference, is_private, created_at`,
            [
              protocol, title, description, cType,
              docNum, issuer, o.responsible_identity, o.responsible_identity,
              issueDate, startDate, expiryDate, o.validity_rule,
              refType, ref, refSource,
              s.identityId, o.id,
              prev.id, nextVersion,
            ]
          )
        ).rows[0];

        // Atualizar estado da obrigação para vigente
        await c.query(
          "UPDATE ext_compliance_obligations SET status = 'vigente', updated_at = NOW() WHERE id = $1",
          [o.id]
        );

        return {
          status: 201,
          body: {
            document: nextDoc,
            previous_document_id: prev.id,
            message: "renovação registrada como nova versão; histórico preservado",
          },
          obligationId: o.id,
          documentId: nextDoc.id,
          target: nextDoc.id,
          eventType: "document_renewed",
          auditMeta: {
            protocol: nextDoc.protocol,
            previous_document_id: prev.id,
            version_no: nextVersion,
            justification: just,
          },
        };
      },
    });
  }

  async function cancelDocument(req, res, id) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document_id" });
    const s = await staffGuard(req, res, true);
    if (!s) return;

    const b = await readBody(req, res);
    const key = b && getIdempotencyKey(req, res);
    if (!b || !key) return;

    const just = txt(b.justification, 10, 1000);
    if (!just) return json(res, 400, { error: "cancellation_justification_required" });

    const fingerprint = hash({ op: "cancel_document", id, just });

    return mutate(res, {
      identity: s.identityId,
      key,
      fingerprint,
      auditAction: "ext07_document_cancel",
      replay: async (c, prior) => ({ document: prior.payload.document, message: prior.payload.message }),
      work: async (c) => {
        const doc = (
          await c.query(
            "SELECT * FROM ext_compliance_documents WHERE id = $1 AND origin = 'ext07_canonica' FOR UPDATE",
            [id]
          )
        ).rows[0];

        if (!doc) return { deny: { status: 404, body: { error: "document_not_found" } } };

        if (doc.status === "cancelada") {
          return { deny: { status: 409, body: { error: "document_already_cancelled" } } };
        }

        const updated = (
          await c.query(
            `UPDATE ext_compliance_documents
             SET status = 'cancelada', cancellation_justification = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, protocol, title, status, cancellation_justification, updated_at`,
            [id, just]
          )
        ).rows[0];

        // Cancelar tarefas abertas associadas a este documento
        await c.query(
          `UPDATE ext_compliance_tasks
           SET status = 'cancelada', cancellation_justification = $2, cancelled_at = NOW()
           WHERE document_id = $1 AND status IN ('aberta', 'em_andamento')`,
          [id, `Documento cancelado: ${just}`]
        );

        return {
          status: 200,
          body: {
            document: updated,
            message: "documento cancelado com justificativa",
          },
          obligationId: doc.obligation_id,
          documentId: doc.id,
          target: doc.id,
          eventType: "document_cancelled",
          auditMeta: { justification: just },
        };
      },
    });
  }

  async function evaluateExpiry(req, res) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const s = await staffGuard(req, res, true);
    if (!s) return;

    const b = await readBody(req, res);
    const key = b && getIdempotencyKey(req, res);
    if (!b || !key) return;

    const date = isDay(b.evaluation_date) ? b.evaluation_date : new Date().toISOString().slice(0, 10);
    const fingerprint = hash({ op: "evaluate_expiry", date });

    return mutate(res, {
      identity: s.identityId,
      key,
      fingerprint,
      auditAction: "ext07_expiry_evaluate",
      replay: async (c, prior) => prior.payload,
      work: async (c) => {
        // Selecionar documentos vigentes/a_vencer com data de expiração alcançada
        const docs = (
          await c.query(
            `SELECT d.*, o.renewal_lead_days, o.responsible_identity AS obligation_responsible,
                    o.title AS obligation_title
             FROM ext_compliance_documents d
             JOIN ext_compliance_obligations o ON o.id = d.obligation_id
             WHERE d.origin = 'ext07_canonica'
               AND d.status::text IN ('vigente', 'a_vencer')
               AND d.expiry_date IS NOT NULL
               AND d.expiry_date <= $1::date
             FOR UPDATE OF d`,
            [date]
          )
        ).rows;

        let created = 0;
        for (const d of docs) {
          const resp = d.responsible_identity || d.obligation_responsible;
          const isRespActive = await activeStaffIdentity(c, resp);
          if (!isRespActive) {
            // Fail closed: não cria tarefa sem responsável ativo válido
            continue;
          }

          const due = d.expiry_date;
          const period = `${d.issue_date || d.effective_start_date}:${d.expiry_date}`;
          const rule = "expiry_at_or_before_evaluation_date";

          const task = (
            await c.query(
              `INSERT INTO ext_compliance_tasks (
                 obligation_id, document_id, validity_period, rule,
                 evaluation_date, due_date, facts, responsible_identity, created_by_identity
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (document_id, validity_period, rule) DO NOTHING
               RETURNING *`,
              [
                d.obligation_id,
                d.id,
                period,
                rule,
                date,
                due,
                JSON.stringify({
                  expiry_date: d.expiry_date,
                  evaluation_date: date,
                  source: "server_date",
                  lead_days: d.renewal_lead_days,
                }),
                resp,
                s.identityId,
              ]
            )
          ).rows[0];

          if (task) created++;

          // Atualizar status do documento para vencida
          await c.query(
            "UPDATE ext_compliance_documents SET status = 'vencida', evaluation_date = $2, updated_at = NOW() WHERE id = $1",
            [d.id, date]
          );

          // Atualizar status da obrigação
          await c.query(
            "UPDATE ext_compliance_obligations SET status = 'vencida', updated_at = NOW() WHERE id = $1",
            [d.obligation_id]
          );
        }

        const responseBody = {
          evaluated: docs.length,
          tasks_created: created,
          evaluation_date: date,
          rule: "expiry_at_or_before_evaluation_date",
          source: "ext_compliance_documents",
          denominator: docs.length,
          absence_is_not_zero: docs.length === 0,
        };

        return {
          status: 200,
          body: responseBody,
          target: s.identityId,
          eventType: "expiry_evaluated",
          auditMeta: { evaluated: docs.length, tasks_created: created, evaluation_date: date },
        };
      },
    });
  }

  async function listTasks(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const s = await staffGuard(req, res);
    if (!s) return;

    try {
      const q = await pool.query(
        `SELECT t.id, t.obligation_id, t.document_id, t.validity_period, t.rule,
                t.evaluation_date, t.due_date, t.status, t.completion_result,
                t.cancellation_justification, t.responsible_identity, t.created_at,
                t.started_at, t.completed_at, t.cancelled_at,
                o.title AS obligation_title, d.protocol AS document_protocol,
                i.display_name AS responsible_name
         FROM ext_compliance_tasks t
         JOIN ext_compliance_obligations o ON o.id = t.obligation_id
         JOIN ext_compliance_documents d ON d.id = t.document_id
         LEFT JOIN auth_identities i ON i.id = t.responsible_identity
         ORDER BY t.due_date ASC, t.created_at DESC
         LIMIT 200`
      );

      return json(res, 200, {
        tasks: q.rows,
        items: q.rows,
        source: "ext_compliance_tasks",
        denominator: q.rows.length,
        absence_is_not_zero: q.rows.length === 0,
      });
    } catch {
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function taskTransition(req, res, id, action) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_task" });
    const s = await staffGuard(req, res, true);
    if (!s) return;

    const b = await readBody(req, res);
    const key = b && getIdempotencyKey(req, res);
    if (!b || !key) return;

    const result = action === "complete" ? txt(b.result, 10, 2000) : null;
    const justification = action === "cancel" ? txt(b.justification, 10, 1000) : null;

    if (action === "complete" && !result) {
      return json(res, 400, { error: "completion_result_required" });
    }
    if (action === "cancel" && !justification) {
      return json(res, 400, { error: "cancellation_justification_required" });
    }

    const fingerprint = hash({ op: `task_${action}`, id, result, justification });

    return mutate(res, {
      identity: s.identityId,
      key,
      fingerprint,
      auditAction: `ext07_task_${action}`,
      replay: async (c, prior) => ({ task: prior.payload.task }),
      work: async (c) => {
        const t = (
          await c.query(
            "SELECT * FROM ext_compliance_tasks WHERE id = $1 FOR UPDATE",
            [id]
          )
        ).rows[0];

        if (!t) return { deny: { status: 404, body: { error: "task_not_found" } } };

        if (["concluida", "cancelada"].includes(t.status)) {
          return { deny: { status: 409, body: { error: "task_terminal" } } };
        }

        if (action === "start" && t.status !== "aberta") {
          return { deny: { status: 409, body: { error: "invalid_transition" } } };
        }

        if (action === "complete") {
          if (!t.responsible_identity || !(await activeStaffIdentity(c, t.responsible_identity))) {
            return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
          }
        }

        const nextStatus = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";

        const r = (
          await c.query(
            `UPDATE ext_compliance_tasks
             SET status = $2,
                 completion_result = CASE WHEN $2 = 'concluida' THEN $3 ELSE completion_result END,
                 cancellation_justification = CASE WHEN $2 = 'cancelada' THEN $4 ELSE cancellation_justification END,
                 started_at = CASE WHEN $2 = 'em_andamento' AND started_at IS NULL THEN NOW() ELSE started_at END,
                 completed_at = CASE WHEN $2 = 'concluida' THEN NOW() ELSE completed_at END,
                 cancelled_at = CASE WHEN $2 = 'cancelada' THEN NOW() ELSE cancelled_at END
             WHERE id = $1
             RETURNING *`,
            [id, nextStatus, result, justification]
          )
        ).rows[0];

        return {
          status: 200,
          body: { task: r },
          taskId: id,
          obligationId: t.obligation_id,
          documentId: t.document_id,
          target: id,
          eventType: `task_${action}`,
          auditMeta: { status: nextStatus, result, justification },
        };
      },
    });
  }

  async function handleLegacy(req, res) {
    let s;
    try {
      s = await requireSession(req);
    } catch {}
    if (!s) return json(res, 401, { error: "unauthorized" });
    if (!STAFF_ROLES.includes(getRole(s))) return json(res, 403, { error: "forbidden" });

    if (req.method !== "GET") {
      if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
      return json(res, 410, {
        error: "legacy_writer_retired",
        canonical: "/api/ext/compliance/*",
      });
    }

    try {
      const { rows } = await pool.query(
        `SELECT * FROM ext_compliance_documents ORDER BY expiry_date ASC NULLS LAST LIMIT 200`
      );
      return json(res, 200, {
        items: rows,
        documents: rows,
        source: "ext_compliance_documents_legado",
        note: "vencimento gera tarefa e documento privado",
        canonical: "/api/ext/compliance/documents",
      });
    } catch {
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function handle(req, res) {
    const p = new URL(req.url, "http://localhost").pathname;

    if (p === "/api/ext/compliance/obligations") {
      if (req.method === "GET") return listObligations(req, res);
      if (req.method === "POST") return createObligation(req, res);
      return json(res, 405, { error: "method_not_allowed" });
    }

    if (p === "/api/ext/compliance/documents") {
      if (req.method === "GET") return listDocuments(req, res);
      if (req.method === "POST") return createDocument(req, res);
      return json(res, 405, { error: "method_not_allowed" });
    }

    const docRenewMatch = p.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/i);
    if (docRenewMatch) {
      if (req.method === "POST") return renewDocument(req, res, docRenewMatch[1]);
      return json(res, 405, { error: "method_not_allowed" });
    }

    const docCancelMatch = p.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/cancel$/i);
    if (docCancelMatch) {
      if (req.method === "POST") return cancelDocument(req, res, docCancelMatch[1]);
      return json(res, 405, { error: "method_not_allowed" });
    }

    const docDetailMatch = p.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/i);
    if (docDetailMatch) {
      if (req.method === "GET") return getDocumentDetail(req, res, docDetailMatch[1]);
      return json(res, 405, { error: "method_not_allowed" });
    }

    if (p === "/api/ext/compliance/evaluate") {
      if (req.method === "POST") return evaluateExpiry(req, res);
      return json(res, 405, { error: "method_not_allowed" });
    }

    if (p === "/api/ext/compliance/tasks") {
      if (req.method === "GET") return listTasks(req, res);
      return json(res, 405, { error: "method_not_allowed" });
    }

    const taskMatch = p.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/i);
    if (taskMatch) {
      if (req.method === "POST") return taskTransition(req, res, taskMatch[1], taskMatch[2]);
      return json(res, 405, { error: "method_not_allowed" });
    }

    return json(res, 404, { error: "not_found" });
  }

  return { handle, handleLegacy };
}
