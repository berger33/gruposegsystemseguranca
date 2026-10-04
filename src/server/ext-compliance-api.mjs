// EXT-07 — API canônica interna de compliance corporativo.
//
// Fronteira declarada e verificável:
//  - jornada exclusivamente interna de staff (admin/ti); não há ator externo;
//  - `ext_compliance_documents` é a fonte canônica; linhas da 086 permanecem
//    `registro_legado` e não são reinterpretadas;
//  - `ext_compliance_tasks` é a fonte da tarefa de vencimento;
//  - a referência documental é declarada: não há upload, bytes, checksum,
//    malware scan, armazenamento verificado nem download;
//  - a fonte declarada da obrigação não é validação jurídica nem confirmação
//    por órgão público;
//  - a avaliação temporal é operação administrativa explícita; não existe
//    execução agendada contínua nesta entrega.

import { createHash, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BODY_LIMIT = 128 * 1024;
const STAFF_ROLES = ["admin", "ti"];
const CRITICALITY = ["baixa", "media", "alta", "critica"];
const OBLIGATION_STATUS = ["pendente", "vigente", "a_vencer", "vencida", "em_renovacao", "nao_aplicavel", "encerrada"];
const COMPLIANCE_TYPE = ["licenca", "certidao", "seguro", "alvara", "outro"];
const SOURCE_KIND = ["declarada_internamente", "referencia_externa_declarada"];
const FILE_BOUNDARY = "referencia_declarada_nao_arquivo_verificado";
const NO_LEGAL_VALIDATION = "fonte_declarada_internamente_sem_validacao_juridica_ou_orgao_publico";

// Projeção mínima de listagem: sem storage_key, sem URL privada, sem número
// documental completo e sem conteúdo integral da referência.
const LIST_COLUMNS = `d.id, d.protocol, d.title, d.compliance_type, d.status, d.obligation_id,
  d.origin, d.issue_date, d.effective_start_date, d.expiry_date, d.version_no,
  d.superseded_by, d.reference_type, d.is_private, d.created_at`;
// Allowlist do detalhe autorizado: inclui a referência declarada, nunca
// storage_key nem file_url.
const DETAIL_COLUMNS = `d.id, d.protocol, d.title, d.description, d.compliance_type, d.status,
  d.obligation_id, d.origin, d.issuer, d.issue_date, d.effective_start_date, d.expiry_date,
  d.validity_rule, d.evaluation_date, d.state_evaluated_at, d.state_evaluation_rule,
  d.reference_type, d.declared_reference, d.reference_source, d.version_no, d.replacement_of,
  d.version_root, d.superseded_by, d.superseded_at, d.renewal_justification,
  d.responsible_identity, d.created_by_identity, d.is_private, d.created_at, d.updated_at`;

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const text = (value, min, max) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};
const isoDate = value => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejeita 2026-13-45 e 2026-02-31: o round-trip precisa bater.
  return parsed.toISOString().slice(0, 10) === value ? value : null;
};
const maskNumber = value => {
  if (typeof value !== "string" || !value.length) return null;
  return value.length <= 4 ? "***" : `***${value.slice(-4)}`;
};

// A impressão digital inclui método e rota: a mesma chave reaproveitada em
// outra rota é divergência, não replay.
const fingerprint = (method, route, body) =>
  createHash("sha256").update(`${method} ${route} ${JSON.stringify(body)}`).digest("hex");

async function readBody(req) {
  const declared = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    throw Object.assign(new Error("body_too_large"), { status: 413 });
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error("body_too_large"), { status: 413 });
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

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  // 401 para anônimo e 403 para papel autenticado não autorizado. A sessão é
  // sempre a única fonte de autoria; o corpo nunca informa ator.
  async function authorize(req, res) {
    let session = null;
    try {
      session = await requireSession(req);
    } catch {
      session = null;
    }
    if (!session || !session.identityId) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    const role = String(session.role || session.userRole || "").toLowerCase();
    if (!STAFF_ROLES.includes(role)) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    return session;
  }

  // Responsável canônico: identidade staff ativa com papel autorizado.
  async function activeStaff(client, identityId) {
    if (!UUID.test(String(identityId || ""))) return false;
    const found = await client.query(
      `SELECT i.id
         FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active' AND p.role = ANY($2::text[])`,
      [identityId, STAFF_ROLES],
    );
    return Boolean(found.rows[0]);
  }

  // BEGIN → lock/revalidação → replay → entidade → tarefa → evento imutável →
  // audit_log → COMMIT. Falha de auditoria faz rollback e devolve 503.
  async function mutate(req, res, session, route, work) {
    if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (key.length < 8 || key.length > 200) return json(res, 400, { error: "idempotency_key_required" });

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, error.status || 400, { error: error.message });
    }
    const digest = fingerprint(req.method, route, body);

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${session.identityId}:${key}`]);

      // Revalida a sessão/identidade dentro da transação: fail-closed.
      const actor = await client.query(
        `SELECT i.id FROM auth_identities i
           JOIN auth_staff_profiles p ON p.identity_id = i.id
          WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active' AND p.role = ANY($2::text[])
          FOR SHARE OF i`,
        [session.identityId, STAFF_ROLES],
      );
      if (!actor.rows[0]) {
        await client.query("ROLLBACK");
        return json(res, 403, { error: "forbidden" });
      }

      const prior = await client.query(
        "SELECT payload, request_fingerprint FROM ext_compliance_events WHERE created_by_identity = $1 AND idempotency_key = $2",
        [session.identityId, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_fingerprint !== digest) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { ...prior.rows[0].payload, replayed: true });
      }

      const outcome = await work(client, body);
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return json(res, outcome.deny.status, outcome.deny.body);
      }

      await client.query(
        `INSERT INTO ext_compliance_events
           (obligation_id, document_id, task_id, event_type, payload, idempotency_key,
            request_fingerprint, request_route, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          outcome.obligationId || null, outcome.documentId || null, outcome.taskId || null,
          outcome.eventType, JSON.stringify(outcome.body), key, digest, route, session.identityId,
        ],
      );

      // Auditoria canônica: sem helper tolerante a falha.
      try {
        await client.query(
          "INSERT INTO audit_log(action, actor, target, meta) VALUES ($1,$2,$3,$4)",
          [outcome.auditAction, session.identityId, String(outcome.target || ""), JSON.stringify(outcome.auditMeta || {})],
        );
      } catch (auditError) {
        await client.query("ROLLBACK");
        console.error("EXT-07 audit_log indisponível; mutação revertida.", auditError?.message);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, outcome.status || 200, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505" || error?.code === "23P01") return json(res, 409, { error: "conflict" });
      if (error?.code === "23514" || error?.code === "P0001") {
        return json(res, 409, { error: "compliance_invariant_rejected", detail: String(error.message).slice(0, 200) });
      }
      console.error("EXT-07 mutation failed", error?.message);
      return json(res, 503, { error: "compliance_journey_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function listObligations(req, res) {
    const found = await pool.query(
      `SELECT o.id, o.obligation_type, o.title, o.description, o.declared_source, o.source_kind,
              o.applicability_scope, o.applicability_justification, o.validity_rule,
              o.renewal_lead_days, o.criticality, o.status, o.responsible_identity,
              i.display_name AS responsible_name, o.created_by_identity, o.created_at, o.updated_at
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id = o.responsible_identity
        ORDER BY o.created_at DESC
        LIMIT 200`,
    );
    return json(res, 200, {
      items: found.rows,
      source: "ext_compliance_obligations",
      denominator: found.rows.length,
      absence_is_not_zero: found.rows.length === 0,
      evidence_boundary: NO_LEGAL_VALIDATION,
    });
  }

  async function listDocuments(req, res) {
    const found = await pool.query(
      `SELECT ${LIST_COLUMNS}, d.document_number
         FROM ext_compliance_documents d
        WHERE d.origin::text = 'ext07_canonica'
        ORDER BY d.expiry_date NULLS LAST
        LIMIT 200`,
    );
    const items = found.rows.map(row => {
      const { document_number: documentNumber, ...rest } = row;
      return {
        ...rest,
        document_number_masked: maskNumber(documentNumber),
        version_state: rest.superseded_by ? "substituida" : "atual",
      };
    });
    return json(res, 200, {
      items,
      source: "ext_compliance_documents",
      projection: "minimizada",
      denominator: items.length,
      absence_is_not_zero: items.length === 0,
      file_boundary: FILE_BOUNDARY,
    });
  }

  async function documentDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_uuid" });
    const found = await pool.query(
      `SELECT ${DETAIL_COLUMNS} FROM ext_compliance_documents d
        WHERE d.id = $1 AND d.origin::text = 'ext07_canonica'`,
      [id],
    );
    const row = found.rows[0];
    if (!row) return json(res, 404, { error: "document_not_found" });
    const history = await pool.query(
      `SELECT id, version_no, status, issue_date, expiry_date, superseded_by, superseded_at, created_at
         FROM ext_compliance_documents
        WHERE origin::text = 'ext07_canonica' AND COALESCE(version_root, id) = COALESCE($1::uuid, $2::uuid)
        ORDER BY version_no ASC`,
      [row.version_root, row.id],
    );
    return json(res, 200, {
      document: { ...row, version_state: row.superseded_by ? "substituida" : "atual" },
      history: history.rows,
      file_boundary: FILE_BOUNDARY,
      projection: "detalhe_autorizado_allowlist",
    });
  }

  async function listTasks(req, res) {
    const found = await pool.query(
      `SELECT t.id, t.obligation_id, t.document_id, t.validity_period, t.rule, t.rule_source,
              t.evaluation_date, t.base_date, t.due_date, t.facts, t.status, t.responsible_identity,
              i.display_name AS responsible_name, t.completion_result, t.cancellation_justification,
              t.created_at, t.started_at, t.completed_at, t.cancelled_at
         FROM ext_compliance_tasks t
         JOIN auth_identities i ON i.id = t.responsible_identity
        ORDER BY t.due_date ASC
        LIMIT 200`,
    );
    const open = found.rows.filter(row => ["aberta", "em_andamento"].includes(row.status)).length;
    return json(res, 200, {
      items: found.rows,
      source: "ext_compliance_tasks",
      denominator: found.rows.length,
      open_tasks: open,
      absence_is_not_zero: found.rows.length === 0,
      generation: "avaliacao_administrativa_explicita_sem_execucao_agendada",
    });
  }

  function createObligation(req, res, session) {
    return mutate(req, res, session, "POST /api/ext/compliance/obligations", async (client, body) => {
      const fields = {
        obligation_type: text(body.obligation_type, 3, 100),
        title: text(body.title, 5, 200),
        description: text(body.description, 10, 2000),
        declared_source: text(body.declared_source, 5, 1000),
        applicability_scope: text(body.applicability_scope, 3, 500),
        applicability_justification: text(body.applicability_justification, 10, 2000),
        validity_rule: text(body.validity_rule, 5, 500),
      };
      const missing = Object.entries(fields).filter(([, value]) => !value).map(([name]) => name);
      if (missing.length) return { deny: { status: 400, body: { error: "invalid_obligation", missing } } };
      if (body.source_kind !== undefined && !SOURCE_KIND.includes(body.source_kind)) {
        return { deny: { status: 400, body: { error: "invalid_source_kind" } } };
      }
      if (body.criticality !== undefined && !CRITICALITY.includes(body.criticality)) {
        return { deny: { status: 400, body: { error: "invalid_criticality" } } };
      }
      if (body.status !== undefined && !OBLIGATION_STATUS.includes(body.status)) {
        return { deny: { status: 400, body: { error: "invalid_status" } } };
      }
      const lead = body.renewal_lead_days;
      if (lead !== undefined && (!Number.isInteger(lead) || lead < 0 || lead > 3650)) {
        return { deny: { status: 400, body: { error: "invalid_renewal_lead_days" } } };
      }
      if (!UUID.test(String(body.responsible_identity || ""))) {
        return { deny: { status: 400, body: { error: "invalid_uuid", field: "responsible_identity" } } };
      }
      if (!(await activeStaff(client, body.responsible_identity))) {
        return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
      }

      // Autoria, estado inicial e timestamps vêm do servidor; o corpo não os
      // informa. `id`, `created_by_identity` e `created_at` enviados são
      // ignorados por construção.
      const inserted = await client.query(
        `INSERT INTO ext_compliance_obligations
           (obligation_type, title, description, declared_source, source_kind, applicability_scope,
            applicability_justification, validity_rule, renewal_lead_days, criticality, status,
            responsible_identity, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12)
         RETURNING id, obligation_type, title, declared_source, source_kind, applicability_scope,
                   validity_rule, renewal_lead_days, criticality, status, responsible_identity,
                   created_by_identity, created_at, updated_at`,
        [
          fields.obligation_type, fields.title, fields.description, fields.declared_source,
          SOURCE_KIND.includes(body.source_kind) ? body.source_kind : "declarada_internamente",
          fields.applicability_scope, fields.applicability_justification, fields.validity_rule,
          Number.isInteger(lead) ? lead : 30,
          CRITICALITY.includes(body.criticality) ? body.criticality : "media",
          body.responsible_identity, session.identityId,
        ],
      );
      const obligation = inserted.rows[0];
      return {
        status: 201,
        body: { obligation, evidence_boundary: NO_LEGAL_VALIDATION },
        obligationId: obligation.id,
        eventType: "obligation_created",
        auditAction: "ext07_obligation_create",
        target: obligation.id,
        auditMeta: { obligation_type: obligation.obligation_type, criticality: obligation.criticality },
      };
    });
  }

  // Valida e monta o corpo comum de documento/renovação.
  function documentFields(body) {
    const title = text(body.title, 5, 200);
    const description = text(body.description, 10, 2000);
    const declaredReference = text(body.declared_reference, 3, 1000);
    const referenceType = text(body.reference_type, 3, 100);
    const issueDate = isoDate(body.issue_date);
    const expiryDate = isoDate(body.expiry_date);
    const startDate = body.effective_start_date === undefined || body.effective_start_date === null
      ? issueDate
      : isoDate(body.effective_start_date);
    if (!title || !description) return { error: { status: 400, body: { error: "invalid_document" } } };
    if (!referenceType || !declaredReference) {
      return { error: { status: 400, body: { error: "private_reference_required", boundary: FILE_BOUNDARY } } };
    }
    if (body.compliance_type !== undefined && !COMPLIANCE_TYPE.includes(body.compliance_type)) {
      return { error: { status: 400, body: { error: "invalid_compliance_type" } } };
    }
    if (!issueDate || !expiryDate || !startDate) {
      return { error: { status: 400, body: { error: "invalid_date" } } };
    }
    if (expiryDate < issueDate || expiryDate < startDate) {
      return { error: { status: 400, body: { error: "invalid_validity", rule: "expiry_date >= issue_date e >= effective_start_date" } } };
    }
    if (startDate < issueDate) {
      return { error: { status: 400, body: { error: "invalid_validity", rule: "effective_start_date >= issue_date" } } };
    }
    // Arquivo real não é declarável nesta jornada.
    if (body.file_url !== undefined || body.storage_key !== undefined || body.file_name !== undefined
        || body.checksum !== undefined || body.bytes !== undefined) {
      return { error: { status: 400, body: { error: "file_claim_not_supported", boundary: FILE_BOUNDARY } } };
    }
    return {
      value: {
        title, description, declaredReference, referenceType, issueDate, expiryDate, startDate,
        complianceType: COMPLIANCE_TYPE.includes(body.compliance_type) ? body.compliance_type : "outro",
        documentNumber: text(body.document_number, 3, 200),
        issuer: text(body.issuer, 3, 200),
        referenceSource: text(body.reference_source, 3, 500),
      },
    };
  }

  const protocolFor = () =>
    `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;

  // Estado temporal derivado do relógio do servidor, nunca do cliente.
  function temporalStatus(client, expiryDate, leadDays) {
    return client.query(
      `SELECT CASE
                WHEN $1::date < CURRENT_DATE THEN 'vencida'
                WHEN $1::date <= CURRENT_DATE + ($2::int || ' days')::interval THEN 'a_vencer'
                ELSE 'vigente'
              END AS status, CURRENT_DATE AS base_date`,
      [expiryDate, leadDays],
    );
  }

  function createDocument(req, res, session) {
    return mutate(req, res, session, "POST /api/ext/compliance/documents", async (client, body) => {
      if (!UUID.test(String(body.obligation_id || ""))) {
        return { deny: { status: 400, body: { error: "invalid_uuid", field: "obligation_id" } } };
      }
      const parsed = documentFields(body);
      if (parsed.error) return { deny: parsed.error };
      const fields = parsed.value;

      const obligationRow = await client.query(
        "SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE",
        [body.obligation_id],
      );
      const obligation = obligationRow.rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      if (obligation.status === "encerrada" || obligation.status === "nao_aplicavel") {
        return { deny: { status: 409, body: { error: "obligation_not_active" } } };
      }
      // Fail-closed: sem responsável staff canônico ativo não há registro.
      if (!(await activeStaff(client, obligation.responsible_identity))) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      }

      const temporal = (await temporalStatus(client, fields.expiryDate, obligation.renewal_lead_days)).rows[0];
      // O identificador é gerado pelo servidor; `id` recebido no corpo é
      // ignorado. A raiz de versão já nasce fechada para não exigir UPDATE
      // posterior sobre um registro canônico imutável.
      const documentId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ext_compliance_documents
           (id, protocol, title, description, compliance_type, status, document_number, issuer,
            responsible_name, responsible_identity, issue_date, effective_start_date, expiry_date,
            validity_rule, evaluation_date, state_evaluated_at, state_evaluation_rule, reference_type,
            declared_reference, reference_source, is_private, created_by_identity, obligation_id,
            origin, version_no, version_root)
         VALUES ($19,$1,$2,$3,$4::ext_compliance_type,$5::ext_compliance_status,$6,$7,
                 (SELECT display_name FROM auth_identities WHERE id = $8), $8, $9,$10,$11,
                 $12, CURRENT_DATE, NOW(), $13, $14, $15, $16, true, $17, $18, 'ext07_canonica', 1, $19)
         RETURNING ${DETAIL_COLUMNS.replaceAll("d.", "")}`,
        [
          protocolFor(), fields.title, fields.description, fields.complianceType, temporal.status,
          fields.documentNumber, fields.issuer, obligation.responsible_identity,
          fields.issueDate, fields.startDate, fields.expiryDate, obligation.validity_rule,
          "estado_derivado_do_relogio_do_servidor_com_lead_da_obrigacao",
          fields.referenceType, fields.declaredReference, fields.referenceSource,
          session.identityId, obligation.id, documentId,
        ],
      );
      const document = inserted.rows[0];
      return {
        status: 201,
        body: {
          document: { ...document, version_state: "atual" },
          file_boundary: FILE_BOUNDARY,
          message: "Referência documental privada registrada. Não representa arquivo armazenado, verificado ou baixável.",
        },
        obligationId: obligation.id,
        documentId: document.id,
        eventType: "document_created",
        auditAction: "ext07_document_create",
        target: document.id,
        auditMeta: { obligation_id: obligation.id, status: temporal.status },
      };
    });
  }

  // Renovação = novo registro vinculado à versão anterior; nada é sobrescrito.
  function renewDocument(req, res, session, id) {
    return mutate(req, res, session, "POST /api/ext/compliance/documents/:id/renew", async (client, body) => {
      if (!UUID.test(id)) return { deny: { status: 400, body: { error: "invalid_uuid", field: "document_id" } } };
      const justification = text(body.renewal_justification, 10, 2000);
      if (!justification) return { deny: { status: 400, body: { error: "renewal_justification_required" } } };
      const parsed = documentFields(body);
      if (parsed.error) return { deny: parsed.error };
      const fields = parsed.value;

      const previousRow = await client.query(
        "SELECT * FROM ext_compliance_documents WHERE id = $1 AND origin::text = 'ext07_canonica' FOR UPDATE",
        [id],
      );
      const previous = previousRow.rows[0];
      if (!previous) return { deny: { status: 404, body: { error: "document_not_found" } } };
      if (previous.superseded_by) return { deny: { status: 409, body: { error: "document_already_superseded" } } };
      if (previous.status === "cancelada") return { deny: { status: 409, body: { error: "terminal_document" } } };
      if (fields.issueDate < previous.issue_date.toISOString().slice(0, 10)) {
        return { deny: { status: 400, body: { error: "renewal_must_not_precede_previous_issue" } } };
      }

      const obligationRow = await client.query(
        "SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE",
        [previous.obligation_id],
      );
      const obligation = obligationRow.rows[0];
      if (!obligation) return { deny: { status: 409, body: { error: "obligation_not_found" } } };
      if (!(await activeStaff(client, obligation.responsible_identity))) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      }

      const temporal = (await temporalStatus(client, fields.expiryDate, obligation.renewal_lead_days)).rows[0];
      const root = previous.version_root || previous.id;
      // A troca de versão atual é consistente apenas no fim da transação.
      await client.query("SET CONSTRAINTS ext_compliance_documents_current_version_unique DEFERRED");
      // 1) marca a versão anterior como substituída, sem alterá-la de forma
      //    destrutiva; 2) insere a nova versão; 3) fecha o vínculo.
      const inserted = await client.query(
        `INSERT INTO ext_compliance_documents
           (protocol, title, description, compliance_type, status, document_number, issuer,
            responsible_name, responsible_identity, issue_date, effective_start_date, expiry_date,
            validity_rule, evaluation_date, state_evaluated_at, state_evaluation_rule, reference_type,
            declared_reference, reference_source, is_private, created_by_identity, obligation_id,
            origin, version_no, replacement_of, version_root, renewal_justification)
         VALUES ($1,$2,$3,$4::ext_compliance_type,$5::ext_compliance_status,$6,$7,
                 (SELECT display_name FROM auth_identities WHERE id = $8), $8, $9,$10,$11,
                 $12, CURRENT_DATE, NOW(), $13, $14, $15, $16, true, $17, $18, 'ext07_canonica',
                 $19, $20, $21, $22)
         RETURNING ${DETAIL_COLUMNS.replaceAll("d.", "")}`,
        [
          protocolFor(), fields.title, fields.description, fields.complianceType, temporal.status,
          fields.documentNumber, fields.issuer, obligation.responsible_identity,
          fields.issueDate, fields.startDate, fields.expiryDate, obligation.validity_rule,
          "estado_derivado_do_relogio_do_servidor_com_lead_da_obrigacao",
          fields.referenceType, fields.declaredReference, fields.referenceSource,
          session.identityId, obligation.id,
          Number(previous.version_no || 1) + 1, previous.id, root, justification,
        ],
      );
      const document = inserted.rows[0];
      await client.query(
        "UPDATE ext_compliance_documents SET superseded_by = $2, superseded_at = NOW() WHERE id = $1",
        [previous.id, document.id],
      );
      return {
        status: 201,
        body: {
          document: { ...document, version_state: "atual" },
          replaced: { id: previous.id, version_no: previous.version_no, version_state: "substituida" },
          history_preserved: true,
          file_boundary: FILE_BOUNDARY,
        },
        obligationId: obligation.id,
        documentId: document.id,
        eventType: "document_renewed",
        auditAction: "ext07_document_renew",
        target: document.id,
        auditMeta: { previous_document_id: previous.id, version_no: document.version_no },
      };
    });
  }

  // Avaliação temporal administrativa: data-base do servidor, regra explícita,
  // tarefa criada na mesma transação. Não há execução agendada contínua.
  function evaluate(req, res, session) {
    return mutate(req, res, session, "POST /api/ext/compliance/evaluate", async (client, body) => {
      if (body.evaluation_date !== undefined) {
        return { deny: { status: 400, body: { error: "client_clock_not_accepted", rule: "data-base é CURRENT_DATE do servidor" } } };
      }
      const baseRow = await client.query("SELECT CURRENT_DATE AS base_date");
      const baseDate = baseRow.rows[0].base_date.toISOString().slice(0, 10);
      const rule = "expiry_date <= CURRENT_DATE (data-base do servidor) na versão atual não cancelada";

      const candidates = await client.query(
        `SELECT d.id, d.obligation_id, d.issue_date, d.effective_start_date, d.expiry_date, d.status,
                o.responsible_identity, o.renewal_lead_days
           FROM ext_compliance_documents d
           JOIN ext_compliance_obligations o ON o.id = d.obligation_id
          WHERE d.origin::text = 'ext07_canonica'
            AND d.superseded_by IS NULL
            AND d.status::text <> 'cancelada'
            AND d.expiry_date IS NOT NULL
            AND d.expiry_date <= CURRENT_DATE
          ORDER BY d.expiry_date ASC
          FOR UPDATE OF d`,
      );

      let created = 0;
      let blocked = 0;
      const tasks = [];
      for (const candidate of candidates.rows) {
        // Fail-closed: sem responsável staff canônico a tarefa não é criada.
        if (!(await activeStaff(client, candidate.responsible_identity))) {
          blocked += 1;
          continue;
        }
        const period = `${(candidate.effective_start_date || candidate.issue_date).toISOString().slice(0, 10)}:${candidate.expiry_date.toISOString().slice(0, 10)}`;
        const facts = {
          expiry_date: candidate.expiry_date.toISOString().slice(0, 10),
          base_date: baseDate,
          source: "server_date",
          renewal_lead_days: candidate.renewal_lead_days,
          previous_status: candidate.status,
        };
        const task = await client.query(
          `INSERT INTO ext_compliance_tasks
             (obligation_id, document_id, validity_period, rule, rule_source, evaluation_date,
              base_date, due_date, facts, responsible_identity, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10)
           ON CONFLICT (document_id, validity_period, rule) DO NOTHING
           RETURNING id, obligation_id, document_id, validity_period, rule, evaluation_date, base_date,
                     due_date, facts, status, responsible_identity`,
          [
            candidate.obligation_id, candidate.id, period, rule,
            "ext07_avaliacao_administrativa", baseDate,
            candidate.expiry_date.toISOString().slice(0, 10), JSON.stringify(facts),
            candidate.responsible_identity, session.identityId,
          ],
        );
        if (task.rows[0]) {
          created += 1;
          tasks.push(task.rows[0]);
        }
        // A data-base, o carimbo e a regra são sempre registrados; o estado só
        // muda quando ainda não era `vencida`.
        await client.query(
          `UPDATE ext_compliance_documents
              SET status = 'vencida'::ext_compliance_status, evaluation_date = $2,
                  state_evaluated_at = NOW(), state_evaluation_rule = $3, updated_at = NOW()
            WHERE id = $1`,
          [candidate.id, baseDate, rule],
        );
      }

      return {
        body: {
          source: "ext_compliance_documents",
          task_source: "ext_compliance_tasks",
          base_date: baseDate,
          rule,
          facts: { evaluated: candidates.rows.length, tasks_created: created, blocked_without_responsible: blocked },
          denominator: candidates.rows.length,
          absence_is_not_zero: candidates.rows.length === 0,
          tasks,
          continuous_monitoring: "nao_implementado_execucao_agendada_futura_necessaria",
        },
        eventType: "expiry_evaluated",
        auditAction: "ext07_expiry_evaluate",
        target: session.identityId,
        auditMeta: { base_date: baseDate, tasks_created: created },
      };
    });
  }

  function taskTransition(req, res, session, id, action) {
    return mutate(req, res, session, `POST /api/ext/compliance/tasks/:id/${action}`, async (client, body) => {
      if (!UUID.test(id)) return { deny: { status: 400, body: { error: "invalid_uuid", field: "task_id" } } };
      const found = await client.query("SELECT * FROM ext_compliance_tasks WHERE id = $1 FOR UPDATE", [id]);
      const task = found.rows[0];
      if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
      if (["concluida", "cancelada"].includes(task.status)) {
        return { deny: { status: 409, body: { error: "terminal_task", status: task.status } } };
      }
      if (action === "start" && task.status !== "aberta") {
        return { deny: { status: 409, body: { error: "invalid_transition", from: task.status } } };
      }

      let result = null;
      let justification = null;
      if (action === "complete") {
        result = text(body.result, 10, 2000);
        if (!result) return { deny: { status: 400, body: { error: "completion_result_required" } } };
        if (!(await activeStaff(client, task.responsible_identity))) {
          return { deny: { status: 409, body: { error: "completion_requires_responsible" } } };
        }
      }
      if (action === "cancel") {
        justification = text(body.justification, 10, 1000);
        if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      }

      const next = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";
      const updated = await client.query(
        `UPDATE ext_compliance_tasks
            SET status = $2,
                completion_result = COALESCE($3, completion_result),
                cancellation_justification = COALESCE($4, cancellation_justification),
                completed_by_identity = CASE WHEN $2 = 'concluida' THEN $5 ELSE completed_by_identity END,
                cancelled_by_identity = CASE WHEN $2 = 'cancelada' THEN $5 ELSE cancelled_by_identity END,
                started_at = CASE WHEN $2 = 'em_andamento' THEN NOW() ELSE started_at END,
                completed_at = CASE WHEN $2 = 'concluida' THEN NOW() ELSE completed_at END,
                cancelled_at = CASE WHEN $2 = 'cancelada' THEN NOW() ELSE cancelled_at END
          WHERE id = $1
          RETURNING id, obligation_id, document_id, status, rule, evaluation_date, base_date, due_date,
                    facts, responsible_identity, completion_result, cancellation_justification,
                    started_at, completed_at, cancelled_at`,
        [id, next, result, justification, session.identityId],
      );
      return {
        body: { task: updated.rows[0], source: "ext_compliance_tasks" },
        obligationId: task.obligation_id,
        documentId: task.document_id,
        taskId: id,
        eventType: `task_${action}`,
        auditAction: `ext07_task_${action}`,
        target: id,
        auditMeta: { from: task.status, to: next },
      };
    });
  }

  async function handle(req, res) {
    const session = await authorize(req, res);
    if (!session) return;
    const pathname = new URL(req.url, "http://localhost").pathname;
    const method = req.method;

    try {
      if (method === "GET" && pathname === "/api/ext/compliance/obligations") return await listObligations(req, res);
      if (method === "GET" && pathname === "/api/ext/compliance/documents") return await listDocuments(req, res);
      if (method === "GET" && pathname === "/api/ext/compliance/tasks") return await listTasks(req, res);

      const detail = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/);
      if (method === "GET" && detail) return await documentDetail(req, res, detail[1]);

      if (method === "POST" && pathname === "/api/ext/compliance/obligations") return await createObligation(req, res, session);
      if (method === "POST" && pathname === "/api/ext/compliance/documents") return await createDocument(req, res, session);
      if (method === "POST" && pathname === "/api/ext/compliance/evaluate") return await evaluate(req, res, session);

      const renew = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/);
      if (method === "POST" && renew) return await renewDocument(req, res, session, renew[1]);

      const transition = pathname.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/);
      if (method === "POST" && transition) return await taskTransition(req, res, session, transition[1], transition[2]);

      // PATCH/PUT/DELETE arbitrários não existem nesta jornada.
      if (["PATCH", "PUT", "DELETE"].includes(method)) {
        if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
        return json(res, 405, { error: "method_not_allowed", canonical: "/api/ext/compliance/*" });
      }
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      console.error("EXT-07 handler failed", error?.message);
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  return { handle };
}
