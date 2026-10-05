// EXT-07 — compliance corporativo canônico (jornada interna de staff).
// Fonte canônica: ext_compliance_documents (endurecida por 153/154).
// Fonte da tarefa: ext_compliance_tasks (dedicada, fail-closed por responsável).
// Fronteira documental: referência declarada; NÃO é arquivo, upload, checksum,
// malware scan, armazenamento verificado ou download.
import { createHash, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/; // regex correta: a 153 usava \\d e nunca casava
const REFERENCE_TYPES = ["referencia_declarada", "numero_declarado", "registro_publico_declarado", "outro_declarado"];
const CRITICALITIES = ["baixa", "media", "alta", "critica"];
const CURRENT_DOC_STATUSES = ["vigente", "a_vencer", "em_renovacao"];
const EXPIRY_RULE = "expiry_at_or_before_evaluation_date";
const MAX_BODY_BYTES = 128 * 1024;

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value, Object.keys(value).sort())).digest("hex");

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("body_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw Object.assign(new Error("object_required"), { status: 400 });
  }
  return parsed;
}

const text = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;

const isDate = (value) => ISO_DATE.test(String(value || ""));

// Identidade staff ativa (admin/ti): regra compartilhada entre a jornada HTTP
// (sessão) e a execução agendada (identidade declarada por ambiente).
export async function isActiveStaffIdentity(client, id) {
  if (!UUID.test(String(id || ""))) return false;
  const query = await client.query(
    `SELECT id FROM auth_identities
      WHERE id=$1 AND kind='staff' AND status='active'
        AND EXISTS (SELECT 1 FROM auth_staff_profiles p
                     WHERE p.identity_id=auth_identities.id AND p.role IN ('admin','ti'))`,
    [id],
  );
  return Boolean(query.rows[0]);
}

// Núcleo da avaliação temporal — compartilhado entre a rota HTTP explícita
// (mutate/sessão staff) e a execução agendada (ext-compliance-scheduler.mjs).
// Data-base é sempre CURRENT_DATE do servidor (relógio do cliente nunca é
// aceito). Vencimento gera tarefa única por documento/período/regra na mesma
// transação; sem responsável staff ativo, falha fechado.
export async function runExpiryEvaluation(client, { actorIdentityId }) {

  const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
  const expired = (
    await client.query(
      `SELECT d.id, d.obligation_id, d.status::text AS status,
              to_char(d.issue_date,'YYYY-MM-DD') AS issue_date,
              to_char(d.effective_start_date,'YYYY-MM-DD') AS effective_start_date,
              to_char(d.expiry_date,'YYYY-MM-DD') AS expiry_date,
              o.responsible_identity
         FROM ext_compliance_documents d
         JOIN ext_compliance_obligations o ON o.id=d.obligation_id
        WHERE d.origin='ext07_canonica' AND d.expiry_date IS NOT NULL
          AND d.expiry_date <= CURRENT_DATE
          AND d.status::text NOT IN ('cancelada','substituida')
        ORDER BY d.expiry_date
        FOR UPDATE OF d`,
    )
  ).rows;
  let tasksCreated = 0;
  let tasksExisting = 0;
  let markedExpired = 0;
  const failedClosed = [];
  for (const doc of expired) {
    if (!(await isActiveStaffIdentity(client, doc.responsible_identity))) {
      // Fail-closed: sem responsável staff ativo não há tarefa nem mudança de estado.
      failedClosed.push({ document_id: doc.id, reason: "responsible_staff_missing" });
      continue;
    }
    const period = `${doc.issue_date || doc.effective_start_date}:${doc.expiry_date}`;
    const task = (
      await client.query(
        `INSERT INTO ext_compliance_tasks
           (obligation_id, document_id, validity_period, rule, evaluation_date, due_date, facts,
            responsible_identity, created_by_identity)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8)
         ON CONFLICT (document_id, validity_period, rule) DO NOTHING
         RETURNING id`,
        [
          doc.obligation_id, doc.id, period, EXPIRY_RULE, doc.expiry_date,
          JSON.stringify({ expiry_date: doc.expiry_date, evaluation_date: today, source: "server_date" }),
          doc.responsible_identity, actorIdentityId,
        ],
      )
    ).rows[0];
    if (task) tasksCreated += 1;
    else tasksExisting += 1;
    if (doc.status !== "vencida") {
      await client.query(
        "UPDATE ext_compliance_documents SET status='vencida', evaluation_date=CURRENT_DATE, updated_at=NOW() WHERE id=$1",
        [doc.id],
      );
      markedExpired += 1;
    }
  }
  // Aviso prévio dentro da antecedência declarada (sem tarefa: tarefa é do vencimento).
  const expiringSoon = (
    await client.query(
      `UPDATE ext_compliance_documents d
          SET status='a_vencer', updated_at=NOW()
         FROM ext_compliance_obligations o
        WHERE o.id=d.obligation_id AND d.origin='ext07_canonica'
          AND d.status::text='vigente'
          AND d.expiry_date > CURRENT_DATE
          AND d.expiry_date - CURRENT_DATE <= o.renewal_lead_days
        RETURNING d.id`,
    )
  ).rows.length;
  // Estado da obrigação deriva do documento corrente (único por índice da 154).
  const obligationsTouched = [...new Set(expired.map((doc) => doc.obligation_id))];
  for (const obligationId of obligationsTouched) {
    const current = (
      await client.query(
        `SELECT status::text AS status FROM ext_compliance_documents
          WHERE obligation_id=$1 AND origin='ext07_canonica'
            AND status::text IN ('vigente','a_vencer','em_renovacao')
          ORDER BY version_no DESC LIMIT 1`,
        [obligationId],
      )
    ).rows[0];
    await client.query("UPDATE ext_compliance_obligations SET status=$2, updated_at=NOW() WHERE id=$1", [
      obligationId,
      current ? current.status : "vencida",
    ]);
  }
  return {
    body: {
      source: "server_date",
      evaluation_date: today,
      rule: EXPIRY_RULE,
      facts: {
        documents_expired: expired.length,
        documents_marked_vencida: markedExpired,
        documents_marked_a_vencer: expiringSoon,
        tasks_created: tasksCreated,
        tasks_already_existing: tasksExisting,
        failed_closed: failedClosed,
      },
      denominator: expired.length,
      absence_is_not_zero: expired.length === 0,
      note: "avaliação temporal explícita segue disponível; execução agendada contínua é opt-in por ambiente (EXT07_EVALUATE_INTERVAL_SECONDS com EXT07_EVALUATE_IDENTITY staff ativa)",
    },
    eventType: "expiry_evaluated",
    auditAction: "ext07_expiry_evaluate",
    target: actorIdentityId,
  };
}

export function createExtComplianceApi({ pool, sameOrigin, requireSession, schedulerState = null }) {
  // Sessão staff real; anônimo recebe 401, papel autenticado não autorizado 403.
  async function staff(req, res) {
    const session = await requireSession(req);
    if (!session) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    const role = String(session.role || session.userRole || "").toLowerCase();
    if (!["admin", "ti"].includes(role)) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    return session;
  }

  // Mutação canônica: BEGIN -> lock/revalidação -> replay idempotência ->
  // escrita -> tarefa -> evento imutável -> audit_log -> COMMIT.
  // Falha de audit_log faz rollback e responde 503 (helper tolerante não é usado).
  async function mutate(req, res, session, work) {
    if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (key.length < 8 || key.length > 200) return json(res, 400, { error: "idempotency_key_required" });
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, error.status || 400, { error: error.message });
    }
    const requestFingerprint = fingerprint(body);
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${session.identityId}:${key}`]);
      const prior = (
        await client.query(
          "SELECT * FROM ext_compliance_events WHERE created_by_identity=$1 AND idempotency_key=$2",
          [session.identityId, key],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== requestFingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { ...prior.payload, replayed: true });
      }
      const outcome = await work(client, body);
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return json(res, outcome.deny.status, outcome.deny.body);
      }
      await client.query(
        `INSERT INTO ext_compliance_events
           (obligation_id, document_id, task_id, action_plan_id, event_type, payload, idempotency_key, request_fingerprint, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          outcome.obligationId || null,
          outcome.documentId || null,
          outcome.taskId || null,
          outcome.actionPlanId || null,
          outcome.eventType,
          JSON.stringify(outcome.body),
          key,
          requestFingerprint,
          session.identityId,
        ],
      );
      try {
        await client.query("INSERT INTO audit_log(action,actor,target,meta) VALUES ($1,$2,$3,$4)", [
          outcome.auditAction,
          session.identityId,
          outcome.target,
          JSON.stringify(outcome.auditMeta || {}),
        ]);
      } catch {
        await client.query("ROLLBACK");
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT");
      return json(res, outcome.status || 200, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      const message = String(error?.message || "");
      if (error?.code === "23505") return json(res, 409, { error: "conflict" });
      if (/compliance (task|document|historical|action plan)|canonical compliance|task (completion|cancellation)|action plan (completion|cancellation)/i.test(message)) {
        return json(res, 409, { error: "invalid_transition", detail: message.slice(0, 120) });
      }
      console.error("EXT-07 mutation failed", message);
      return json(res, 503, { error: "compliance_journey_unavailable" });
    } finally {
      client?.release();
    }
  }

  const DOC_LIST_COLUMNS = `d.id, d.protocol, d.title, d.description, d.compliance_type::text AS compliance_type,
    d.status::text AS status, d.obligation_id, d.origin, d.is_private, d.version_no, d.replacement_of,
    to_char(d.effective_start_date,'YYYY-MM-DD') AS effective_start_date,
    to_char(d.issue_date,'YYYY-MM-DD') AS issue_date,
    to_char(d.expiry_date,'YYYY-MM-DD') AS expiry_date,
    d.reference_type, d.created_at, d.updated_at`;

  async function listDocuments(req, res) {
    const query = await pool.query(
      `SELECT ${DOC_LIST_COLUMNS}
         FROM ext_compliance_documents d
        WHERE d.origin='ext07_canonica'
        ORDER BY d.expiry_date NULLS LAST, d.created_at DESC LIMIT 200`,
    );
    return json(res, 200, {
      items: query.rows,
      source: "ext_compliance_documents",
      file_boundary: "referencia_declarada_nao_arquivo_verificado",
    });
  }

  async function documentDetail(req, res, id) {
    if (!UUID.test(String(id || ""))) return json(res, 400, { error: "invalid_document" });
    const row = (
      await pool.query(
        `SELECT ${DOC_LIST_COLUMNS}, d.document_number, d.declared_reference, d.reference_source,
                d.responsible_identity, d.cancellation_justification, d.validity_rule,
                to_char(d.evaluation_date,'YYYY-MM-DD') AS evaluation_date
           FROM ext_compliance_documents d
          WHERE d.id=$1 AND d.origin='ext07_canonica'`,
        [id],
      )
    ).rows[0];
    if (!row) return json(res, 404, { error: "document_not_found" });
    return json(res, 200, {
      document: row,
      source: "ext_compliance_documents",
      file_boundary: "referencia_declarada_nao_arquivo_verificado",
    });
  }

  async function listObligations(req, res) {
    const query = await pool.query(
      `SELECT o.id, o.obligation_type, o.title, o.description, o.declared_source, o.applicability_scope,
              o.applicability_justification, o.validity_rule, o.renewal_lead_days, o.criticality,
              o.status::text AS status, o.responsible_identity, i.display_name AS responsible_name, o.created_at
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id=o.responsible_identity
        ORDER BY o.created_at DESC LIMIT 200`,
    );
    return json(res, 200, {
      items: query.rows,
      source: "ext_compliance_obligations",
      denominator: query.rows.length,
      absence_is_not_zero: query.rows.length === 0,
    });
  }

  async function createObligation(req, res, session) {
    return mutate(req, res, session, async (client, body) => {
      const obligationType = text(body.obligation_type, 3, 100);
      const title = text(body.title, 5, 200);
      const description = text(body.description, 10, 2000);
      const declaredSource = text(body.declared_source, 5, 1000);
      const scope = text(body.applicability_scope, 3, 500);
      const justification = text(body.applicability_justification, 10, 2000);
      const validityRule = text(body.validity_rule, 5, 500);
      if (!obligationType || !title || !description || !declaredSource || !scope || !justification || !validityRule) {
        return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      }
      // Estado, autoria e timestamps vêm do servidor; corpo não decide nada disso.
      const responsible = body.responsible_identity;
      if (!(await isActiveStaffIdentity(client, responsible))) {
        return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
      }
      const lead = Number.isInteger(body.renewal_lead_days) ? body.renewal_lead_days : 30;
      const criticality = CRITICALITIES.includes(body.criticality) ? body.criticality : "media";
      const row = (
        await client.query(
          `INSERT INTO ext_compliance_obligations
             (obligation_type, title, description, declared_source, applicability_scope,
              applicability_justification, validity_rule, renewal_lead_days, criticality,
              responsible_identity, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [obligationType, title, description, declaredSource, scope, justification, validityRule, lead, criticality, responsible, session.identityId],
        )
      ).rows[0];
      return {
        status: 201,
        body: { obligation: row, message: "obrigação declarada; não é validação jurídica nem confirmação por órgão público" },
        obligationId: row.id,
        eventType: "obligation_created",
        auditAction: "ext07_obligation_create",
        target: row.id,
      };
    });
  }

  // Datas coerentes: emissão não futura, vencimento >= emissão, vigência dentro do período.
  // O estado é derivado do relógio do servidor, nunca do corpo.
  function validateDocumentDates({ issue, expiry, effectiveStart, today, requireCurrentValidity }) {
    if (!isDate(issue) || !isDate(expiry)) return { error: "invalid_validity" };
    if (issue > today) return { error: "issue_date_in_future" };
    if (expiry < issue) return { error: "invalid_validity" };
    if (effectiveStart !== undefined && effectiveStart !== null) {
      if (!isDate(effectiveStart) || effectiveStart < issue || effectiveStart > expiry) return { error: "invalid_validity" };
    }
    if (requireCurrentValidity && expiry < today) return { error: "renewal_requires_current_validity" };
    return { status: expiry < today ? "vencida" : "vigente" };
  }

  async function createDocument(req, res, session) {
    return mutate(req, res, session, async (client, body) => {
      if (!UUID.test(String(body.obligation_id || ""))) return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      const obligation = (
        await client.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [body.obligation_id])
      ).rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      if (!(await isActiveStaffIdentity(client, obligation.responsible_identity))) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      }
      // Uma versão corrente por obrigação: nova referência exige renovação.
      const current = (
        await client.query(
          `SELECT id FROM ext_compliance_documents
            WHERE obligation_id=$1 AND origin='ext07_canonica'
              AND status::text IN ('vigente','a_vencer','em_renovacao')`,
          [obligation.id],
        )
      ).rows[0];
      if (current) return { deny: { status: 409, body: { error: "current_document_exists", hint: "renove o documento atual" } } };
      const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
      const issue = body.issue_date;
      const expiry = body.expiry_date;
      const effectiveStart = body.effective_start_date ?? issue;
      const dates = validateDocumentDates({ issue, expiry, effectiveStart, today, requireCurrentValidity: false });
      if (dates.error) return { deny: { status: 400, body: { error: dates.error } } };
      const referenceType = REFERENCE_TYPES.includes(body.reference_type) ? body.reference_type : null;
      const declaredReference = text(body.declared_reference, 3, 1000);
      if (!referenceType || !declaredReference) {
        return { deny: { status: 400, body: { error: "private_reference_required" } } };
      }
      const title = text(body.title, 5, 200);
      const description = text(body.description, 10, 2000);
      if (!title || !description) return { deny: { status: 400, body: { error: "invalid_document" } } };
      const documentNumber = text(body.document_number, 3, 200);
      const referenceSource = text(body.reference_source, 3, 500);
      const protocol = `COMP-EXT-${today.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      let row;
      try {
        row = (
          await client.query(
            `INSERT INTO ext_compliance_documents
               (protocol, title, description, compliance_type, status, document_number, issuer,
                responsible_identity, issue_date, effective_start_date, expiry_date, validity_rule,
                evaluation_date, reference_type, declared_reference, reference_source, is_private,
                created_by_identity, obligation_id, origin)
             VALUES ($1,$2,$3,$4,$5::ext_compliance_status,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13,$14,$15,true,$16,$17,'ext07_canonica')
             RETURNING id, protocol, title, status::text AS status, obligation_id, origin, version_no, replacement_of,
                       to_char(issue_date,'YYYY-MM-DD') AS issue_date,
                       to_char(effective_start_date,'YYYY-MM-DD') AS effective_start_date,
                       to_char(expiry_date,'YYYY-MM-DD') AS expiry_date,
                       reference_type, is_private`,
            [
              protocol, title, description,
              ["licenca", "certidao", "seguro", "alvara", "outro"].includes(body.compliance_type) ? body.compliance_type : "outro",
              dates.status, documentNumber, text(body.issuer, 3, 200), obligation.responsible_identity,
              issue, effectiveStart, expiry, obligation.validity_rule, referenceType, declaredReference,
              referenceSource, session.identityId, obligation.id,
            ],
          )
        ).rows[0];
      } catch (error) {
        if (error?.code === "23505" && String(error?.constraint || "").includes("current_document_unique")) {
          return { deny: { status: 409, body: { error: "current_document_exists", hint: "renove o documento atual" } } };
        }
        throw error;
      }
      return {
        status: 201,
        body: {
          document: row,
          message: "referência privada registrada; não representa arquivo armazenado, bytes, checksum, malware scan ou download",
        },
        obligationId: obligation.id,
        documentId: row.id,
        eventType: "document_created",
        auditAction: "ext07_document_create",
        target: row.id,
      };
    });
  }

  // Renovação: novo registro com vínculo explícito ao anterior; o anterior vira
  // 'substituida' (terminal) e nunca é sobrescrito. Sem ciclo: só documento
  // corrente não terminal pode ser renovado, e cada renovação o torna terminal.
  async function renewDocument(req, res, session, id) {
    return mutate(req, res, session, async (client, body) => {
      if (!UUID.test(String(id || ""))) return { deny: { status: 400, body: { error: "invalid_document" } } };
      const previous = (
        await client.query("SELECT * FROM ext_compliance_documents WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!previous) return { deny: { status: 404, body: { error: "document_not_found" } } };
      if (previous.origin !== "ext07_canonica") {
        return { deny: { status: 409, body: { error: "legacy_document_not_renewable" } } };
      }
      if (!CURRENT_DOC_STATUSES.concat(["vencida"]).includes(String(previous.status))) {
        return { deny: { status: 409, body: { error: "terminal_document_not_renewable" } } };
      }
      const justification = text(body.justification, 10, 2000);
      if (!justification) return { deny: { status: 400, body: { error: "renewal_justification_required" } } };
      const obligation = (
        await client.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [previous.obligation_id])
      ).rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      if (!(await isActiveStaffIdentity(client, obligation.responsible_identity))) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      }
      const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
      const issue = body.issue_date;
      const expiry = body.expiry_date;
      const effectiveStart = body.effective_start_date ?? issue;
      const dates = validateDocumentDates({ issue, expiry, effectiveStart, today, requireCurrentValidity: true });
      if (dates.error) return { deny: { status: 400, body: { error: dates.error } } };
      const referenceType = REFERENCE_TYPES.includes(body.reference_type) ? body.reference_type : previous.reference_type;
      const declaredReference = text(body.declared_reference, 3, 1000);
      if (!declaredReference) return { deny: { status: 400, body: { error: "private_reference_required" } } };
      const referenceSource = text(body.reference_source, 3, 500) ?? previous.reference_source;
      const protocol = `COMP-EXT-${today.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      await client.query("UPDATE ext_compliance_documents SET status='substituida', updated_at=NOW() WHERE id=$1", [previous.id]);
      const row = (
        await client.query(
          `INSERT INTO ext_compliance_documents
             (protocol, title, description, compliance_type, status, document_number, issuer,
              responsible_identity, issue_date, effective_start_date, expiry_date, validity_rule,
              reference_type, declared_reference, reference_source, is_private, created_by_identity,
              obligation_id, origin, replacement_of, version_no)
           VALUES ($1,$2,$3,$4,'vigente',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15,$16,'ext07_canonica',$17,$18)
           RETURNING id, protocol, title, status::text AS status, obligation_id, origin, version_no, replacement_of,
                     to_char(issue_date,'YYYY-MM-DD') AS issue_date,
                     to_char(effective_start_date,'YYYY-MM-DD') AS effective_start_date,
                     to_char(expiry_date,'YYYY-MM-DD') AS expiry_date,
                     reference_type, is_private`,
          [
            protocol, text(body.title, 5, 200) ?? previous.title,
            text(body.description, 10, 2000) ?? previous.description,
            String(previous.compliance_type), text(body.document_number, 3, 200) ?? previous.document_number,
            text(body.issuer, 3, 200) ?? previous.issuer, obligation.responsible_identity,
            issue, effectiveStart, expiry, obligation.validity_rule, referenceType, declaredReference,
            referenceSource, session.identityId, obligation.id, previous.id, previous.version_no + 1,
          ],
        )
      ).rows[0];
      return {
        status: 201,
        body: {
          document: row,
          previous: { id: previous.id, status: "substituida", version_no: previous.version_no },
          justification,
          message: "renovação criada como novo registro; o anterior é histórico imutável",
        },
        obligationId: obligation.id,
        documentId: row.id,
        eventType: "document_renewed",
        auditAction: "ext07_document_renew",
        target: row.id,
        auditMeta: { previous_document_id: previous.id, version_no: row.version_no },
      };
    });
  }

  // Avaliação temporal explícita (jornada staff): delega ao núcleo compartilhado
  // com a execução agendada. Contrato HTTP inalterado.
  async function evaluate(req, res, session) {
    return mutate(req, res, session, (client) => runExpiryEvaluation(client, { actorIdentityId: session.identityId }));
  }

  // Observação da execução agendada: estado do processo + ledger de execuções.
  // Leitura autorizada (admin/ti); ligar/desligar é decisão de ambiente, não de API.
  async function listSchedule(req, res) {
    const state = typeof schedulerState === "function" ? schedulerState() : {};
    let actor = null;
    if (state?.actorIdentity) {
      const identity = (
        await pool.query("SELECT id, display_name FROM auth_identities WHERE id=$1", [state.actorIdentity])
      ).rows[0];
      actor = identity
        ? { id: identity.id, display_name: identity.display_name }
        : { id: state.actorIdentity, display_name: null };
    }
    const runs = (
      await pool.query(
        `SELECT r.id, r.origem, r.status, to_char(r.evaluation_date,'YYYY-MM-DD') AS evaluation_date,
                r.started_at, r.finished_at, r.interval_seconds, r.idempotency_key, r.facts, r.error,
                r.actor_identity, i.display_name AS actor_display_name
           FROM ext_compliance_evaluation_runs r
           LEFT JOIN auth_identities i ON i.id=r.actor_identity
          ORDER BY r.started_at DESC LIMIT 200`,
      )
    ).rows;
    return json(res, 200, {
      enabled: Boolean(state?.enabled),
      interval_seconds: state?.intervalSeconds ?? null,
      actor,
      activation: "ambiente: EXT07_EVALUATE_INTERVAL_SECONDS com EXT07_EVALUATE_IDENTITY (staff admin/ti ativa)",
      runs,
      source: "ext_compliance_evaluation_runs",
      note: "execução agendada é in-process e opt-in; cada execução registra uma linha (concluida ou falha); enabled reflete este processo do servidor",
    });
  }

  async function listTasks(req, res) {
    const query = await pool.query(
      `SELECT t.id, t.obligation_id, t.document_id, t.validity_period, t.rule,
              to_char(t.evaluation_date,'YYYY-MM-DD') AS evaluation_date,
              to_char(t.due_date,'YYYY-MM-DD') AS due_date,
              t.status::text AS status, t.responsible_identity, t.completion_result,
              t.cancellation_justification, t.created_at, t.started_at, t.completed_at, t.cancelled_at
         FROM ext_compliance_tasks t
        ORDER BY t.due_date, t.created_at LIMIT 200`,
    );
    return json(res, 200, { items: query.rows, source: "ext_compliance_tasks", rule: EXPIRY_RULE });
  }

  async function taskTransition(req, res, session, id, action) {
    return mutate(req, res, session, async (client, body) => {
      if (!UUID.test(String(id || ""))) return { deny: { status: 400, body: { error: "invalid_task" } } };
      const task = (await client.query("SELECT * FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
      const status = String(task.status);
      if (["concluida", "cancelada"].includes(status)) {
        return { deny: { status: 409, body: { error: "invalid_transition", detail: "terminal_task" } } };
      }
      if (action === "start" && status !== "aberta") {
        return { deny: { status: 409, body: { error: "invalid_transition" } } };
      }
      if (action === "complete") {
        const result = text(body.result, 10, 2000);
        if (!result) return { deny: { status: 400, body: { error: "completion_result_required" } } };
        if (!(await isActiveStaffIdentity(client, task.responsible_identity))) {
          return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
        }
      }
      if (action === "cancel") {
        const justification = text(body.justification, 10, 1000);
        if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      }
      const next = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";
      const row = (
        await client.query(
          `UPDATE ext_compliance_tasks
              SET status=$2,
                  completion_result=COALESCE($3, completion_result),
                  cancellation_justification=COALESCE($4, cancellation_justification),
                  started_at=CASE WHEN $2='em_andamento' THEN NOW() ELSE started_at END,
                  completed_at=CASE WHEN $2='concluida' THEN NOW() ELSE completed_at END,
                  cancelled_at=CASE WHEN $2='cancelada' THEN NOW() ELSE cancelled_at END
            WHERE id=$1
            RETURNING id, obligation_id, document_id, validity_period, rule,
                      to_char(evaluation_date,'YYYY-MM-DD') AS evaluation_date,
                      to_char(due_date,'YYYY-MM-DD') AS due_date,
                      status::text AS status, responsible_identity, completion_result,
                      cancellation_justification, created_at, started_at, completed_at, cancelled_at`,
          [id, next, body.result || null, body.justification || null],
        )
      ).rows[0];
      return {
        body: { task: row },
        taskId: id,
        eventType: `task_${action}`,
        auditAction: `ext07_task_${action}`,
        target: id,
      };
    });
  }

  async function listActionPlans(req, res) {
    const url = new URL(req.url, "http://localhost");
    const obligationId = url.searchParams.get("obligation_id");
    const status = url.searchParams.get("status");
    const planType = url.searchParams.get("plan_type");

    let sql = `SELECT p.id, p.obligation_id, p.document_id, p.task_id, p.plan_type,
                      p.title, p.description, p.root_cause, p.status,
                      to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
                      p.responsible_identity, i.display_name AS responsible_name,
                      p.completion_result, p.cancellation_justification,
                      p.started_at, p.completed_at, p.cancelled_at, p.created_at, p.updated_at,
                      o.title AS obligation_title
                 FROM ext_compliance_action_plans p
                 JOIN ext_compliance_obligations o ON o.id=p.obligation_id
                 JOIN auth_identities i ON i.id=p.responsible_identity`;
    const where = [];
    const params = [];
    if (obligationId && UUID.test(obligationId)) {
      params.push(obligationId);
      where.push(`p.obligation_id = $${params.length}`);
    }
    if (status && ["aberto", "em_andamento", "concluido", "cancelado"].includes(status)) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    if (planType && ["corretivo", "preventivo"].includes(planType)) {
      params.push(planType);
      where.push(`p.plan_type = $${params.length}`);
    }
    if (where.length) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }
    sql += ` ORDER BY p.due_date ASC, p.created_at DESC LIMIT 200`;

    const query = await pool.query(sql, params);
    return json(res, 200, {
      items: query.rows,
      source: "ext_compliance_action_plans",
      denominator: query.rows.length,
      absence_is_not_zero: query.rows.length === 0,
      note: "planos de ação corretivos e preventivos são controles internos auditados; não representam parecer jurídico",
    });
  }

  async function actionPlanDetail(req, res, id) {
    if (!UUID.test(String(id || ""))) return json(res, 400, { error: "invalid_action_plan" });
    const row = (
      await pool.query(
        `SELECT p.id, p.obligation_id, p.document_id, p.task_id, p.plan_type,
                p.title, p.description, p.root_cause, p.status,
                to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
                p.responsible_identity, i.display_name AS responsible_name,
                p.created_by_identity, c.display_name AS created_by_name,
                p.completion_result, p.cancellation_justification,
                p.started_at, p.completed_at, p.cancelled_at, p.created_at, p.updated_at,
                o.title AS obligation_title
           FROM ext_compliance_action_plans p
           JOIN ext_compliance_obligations o ON o.id=p.obligation_id
           JOIN auth_identities i ON i.id=p.responsible_identity
           JOIN auth_identities c ON c.id=p.created_by_identity
          WHERE p.id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) return json(res, 404, { error: "action_plan_not_found" });

    const events = await pool.query(
      `SELECT e.id, e.event_type, e.payload, e.created_at, e.created_by_identity,
              i.display_name AS created_by_name
         FROM ext_compliance_events e
         LEFT JOIN auth_identities i ON i.id=e.created_by_identity
        WHERE e.action_plan_id=$1
        ORDER BY e.created_at ASC`,
      [id],
    );

    return json(res, 200, {
      action_plan: row,
      events: events.rows,
      source: "ext_compliance_action_plans",
    });
  }

  async function createActionPlan(req, res, session) {
    return mutate(req, res, session, async (client, body) => {
      if (!UUID.test(String(body.obligation_id || ""))) {
        return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      }
      const obligation = (
        await client.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [body.obligation_id])
      ).rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };

      let documentId = null;
      if (body.document_id) {
        if (!UUID.test(String(body.document_id))) {
          return { deny: { status: 400, body: { error: "invalid_document" } } };
        }
        const doc = (
          await client.query(
            "SELECT id, obligation_id, status::text AS status FROM ext_compliance_documents WHERE id=$1 AND origin='ext07_canonica'",
            [body.document_id],
          )
        ).rows[0];
        if (!doc || doc.obligation_id !== obligation.id) {
          return { deny: { status: 404, body: { error: "document_not_found" } } };
        }
        documentId = doc.id;
      }

      let taskId = null;
      if (body.task_id) {
        if (!UUID.test(String(body.task_id))) {
          return { deny: { status: 400, body: { error: "invalid_task" } } };
        }
        const task = (
          await client.query("SELECT id, obligation_id FROM ext_compliance_tasks WHERE id=$1", [body.task_id])
        ).rows[0];
        if (!task || task.obligation_id !== obligation.id) {
          return { deny: { status: 404, body: { error: "task_not_found" } } };
        }
        taskId = task.id;
      }

      const planType = body.plan_type === "corretivo" || body.plan_type === "preventivo" ? body.plan_type : null;
      if (!planType) {
        return { deny: { status: 400, body: { error: "invalid_plan_type", hint: "use 'corretivo' ou 'preventivo'" } } };
      }

      const title = text(body.title, 5, 200);
      const description = text(body.description, 10, 2000);
      const rootCause = body.root_cause !== undefined && body.root_cause !== null && String(body.root_cause).trim() !== ""
        ? text(body.root_cause, 5, 2000)
        : null;
      if (body.root_cause && String(body.root_cause).trim() !== "" && !rootCause) {
        return { deny: { status: 400, body: { error: "invalid_root_cause" } } };
      }
      if (!title || !description) {
        return { deny: { status: 400, body: { error: "invalid_action_plan" } } };
      }

      if (!isDate(body.due_date)) {
        return { deny: { status: 400, body: { error: "invalid_due_date" } } };
      }

      const responsible = body.responsible_identity || obligation.responsible_identity;
      if (!(await isActiveStaffIdentity(client, responsible))) {
        return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
      }

      const row = (
        await client.query(
          `INSERT INTO ext_compliance_action_plans
             (obligation_id, document_id, task_id, plan_type, title, description, root_cause,
              due_date, responsible_identity, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, obligation_id, document_id, task_id, plan_type, title, description, root_cause,
                     status, to_char(due_date,'YYYY-MM-DD') AS due_date, responsible_identity,
                     created_by_identity, created_at, updated_at`,
          [obligation.id, documentId, taskId, planType, title, description, rootCause, body.due_date, responsible, session.identityId],
        )
      ).rows[0];

      return {
        status: 201,
        body: {
          action_plan: row,
          message: "plano de ação preventivo/corretivo registrado; controle interno auditado de conformidade",
        },
        obligationId: obligation.id,
        documentId: documentId,
        taskId: taskId,
        actionPlanId: row.id,
        eventType: "action_plan_created",
        auditAction: "ext07_action_plan_create",
        target: row.id,
        auditMeta: { plan_type: planType, obligation_id: obligation.id },
      };
    });
  }

  async function actionPlanTransition(req, res, session, id, action) {
    return mutate(req, res, session, async (client, body) => {
      if (!UUID.test(String(id || ""))) return { deny: { status: 400, body: { error: "invalid_action_plan" } } };
      const plan = (
        await client.query("SELECT * FROM ext_compliance_action_plans WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!plan) return { deny: { status: 404, body: { error: "action_plan_not_found" } } };
      const status = String(plan.status);
      if (["concluido", "cancelado"].includes(status)) {
        return { deny: { status: 409, body: { error: "invalid_transition", detail: "terminal_action_plan" } } };
      }
      if (action === "start" && status !== "aberto") {
        return { deny: { status: 409, body: { error: "invalid_transition" } } };
      }
      if (action === "complete") {
        const result = text(body.result, 10, 2000);
        if (!result) return { deny: { status: 400, body: { error: "completion_result_required" } } };
        if (!(await isActiveStaffIdentity(client, plan.responsible_identity))) {
          return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
        }
      }
      if (action === "cancel") {
        const justification = text(body.justification, 10, 1000);
        if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      }
      const next = action === "start" ? "em_andamento" : action === "complete" ? "concluido" : "cancelado";
      const row = (
        await client.query(
          `UPDATE ext_compliance_action_plans
              SET status=$2,
                  completion_result=COALESCE($3, completion_result),
                  cancellation_justification=COALESCE($4, cancellation_justification),
                  started_at=CASE WHEN $2='em_andamento' THEN NOW() ELSE started_at END,
                  completed_at=CASE WHEN $2='concluido' THEN NOW() ELSE completed_at END,
                  cancelled_at=CASE WHEN $2='cancelado' THEN NOW() ELSE cancelled_at END
            WHERE id=$1
            RETURNING id, obligation_id, document_id, task_id, plan_type, title, description, root_cause,
                      status, to_char(due_date,'YYYY-MM-DD') AS due_date, responsible_identity,
                      completion_result, cancellation_justification,
                      created_at, started_at, completed_at, cancelled_at, updated_at`,
          [id, next, body.result || null, body.justification || null],
        )
      ).rows[0];
      return {
        body: { action_plan: row },
        obligationId: plan.obligation_id,
        documentId: plan.document_id,
        taskId: plan.task_id,
        actionPlanId: id,
        eventType: `action_plan_${action}`,
        auditAction: `ext07_action_plan_${action}`,
        target: id,
      };
    });
  }

  async function handle(req, res) {
    const session = await staff(req, res);
    if (!session) return;
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (req.method !== "GET" && !sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    if (req.method === "GET" && pathname === "/api/ext/compliance/documents") return listDocuments(req, res);
    if (req.method === "GET" && pathname === "/api/ext/compliance/obligations") return listObligations(req, res);
    if (req.method === "GET" && pathname === "/api/ext/compliance/tasks") return listTasks(req, res);
    if (req.method === "GET" && pathname === "/api/ext/compliance/action-plans") return listActionPlans(req, res);
    if (req.method === "GET" && pathname === "/api/ext/compliance/schedule") return listSchedule(req, res);
    if (req.method === "POST" && pathname === "/api/ext/compliance/obligations") return createObligation(req, res, session);
    if (req.method === "POST" && pathname === "/api/ext/compliance/documents") return createDocument(req, res, session);
    if (req.method === "POST" && pathname === "/api/ext/compliance/action-plans") return createActionPlan(req, res, session);
    if (req.method === "POST" && pathname === "/api/ext/compliance/evaluate") return evaluate(req, res, session);
    const detail = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/);
    if (req.method === "GET" && detail) return documentDetail(req, res, detail[1]);
    const planDetail = pathname.match(/^\/api\/ext\/compliance\/action-plans\/([^/]+)$/);
    if (req.method === "GET" && planDetail) return actionPlanDetail(req, res, planDetail[1]);
    const renew = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/);
    if (req.method === "POST" && renew) return renewDocument(req, res, session, renew[1]);
    const transition = pathname.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/);
    if (req.method === "POST" && transition) return taskTransition(req, res, session, transition[1], transition[2]);
    const planTransition = pathname.match(/^\/api\/ext\/compliance\/action-plans\/([^/]+)\/(start|complete|cancel)$/);
    if (req.method === "POST" && planTransition) return actionPlanTransition(req, res, session, planTransition[1], planTransition[2]);
    return json(res, 405, { error: "method_not_allowed" });
  }

  return { handle };
}
