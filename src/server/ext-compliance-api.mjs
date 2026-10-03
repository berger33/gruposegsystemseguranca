// EXT-07 — Compliance corporativo ligado ao backend canônico real.
//
// Critério do plano: "Vencimento gera tarefa e documento privado".
//
// FRONTEIRA DE ATOR: esta jornada é INTERNA de equipe (staff). Não existe
// ator externo, portal público, órgão regulador integrado nem cliente final
// agindo aqui. Anônimo recebe 401; papel autenticado sem direito recebe 403.
//
// FRONTEIRA DOCUMENTAL: `declared_reference` é uma REFERÊNCIA DECLARADA pela
// equipe. NÃO existe upload, bytes, checksum, malware scan, armazenamento
// verificado nem download nesta entrega. A migração 154 proíbe que a linha
// canônica declare `storage_key` ou `file_url`, justamente para que ninguém
// leia a referência como arquivo guardado.
//
// FRONTEIRA JURÍDICA: fonte, escopo e aplicabilidade são DECLARADOS pela
// equipe interna. Nada aqui é validação jurídica nem confirmação por órgão
// público; a API devolve isso explicitamente em `legal_validation`.
//
// O que este módulo impõe sobre as migrações 153 + 154:
//   * autoria SEMPRE derivada da sessão: id, autor, estado, versão, protocolo
//     e contadores nunca vêm do corpo — campo de servidor no corpo é 400;
//   * responsável canônico é identidade staff ATIVA e autorizada, revalidada
//     dentro da transação; sem responsável a geração falha FECHADA;
//   * validade com regra declarada: vencimento nunca antes da emissão nem do
//     início de vigência, e o estado temporal vem do relógio do PostgreSQL
//     (CURRENT_DATE), nunca do cliente;
//   * renovação é REGISTRO NOVO com vínculo à versão anterior, justificativa e
//     supersessão explícita — jamais sobrescrita do documento existente;
//   * tarefa de vencimento é única por (documento, período, regra), nasce na
//     MESMA transação da avaliação e carrega regra, data-base e fatos;
//   * negócio + evento imutável + audit_log na MESMA transação: auditoria
//     indisponível devolve 503 e não deixa obrigação, documento, tarefa,
//     evento ou estado alterados;
//   * idempotência por (identidade, chave): retry idêntico devolve o mesmo
//     resultado sem duplicar, reuso com corpo divergente devolve 409.

import { createHash, randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const MAX_BODY_BYTES = 64 * 1024;

/** Quem lê e escreve compliance. Papel autenticado fora daqui recebe 403. */
export const COMPLIANCE_ROLES = Object.freeze(["admin", "ti"]);
/** Quem pode ser responsável canônico por obrigação/documento/tarefa. */
export const COMPLIANCE_RESPONSIBLE_ROLES = Object.freeze(["admin", "ti"]);

export const OBLIGATION_TYPES = Object.freeze([
  "licenca", "certidao", "seguro", "alvara", "contrato", "obrigacao_legal", "outro",
]);
export const OBLIGATION_CRITICALITIES = Object.freeze(["baixa", "media", "alta", "critica"]);
export const OBLIGATION_STATUSES = Object.freeze([
  "pendente", "vigente", "a_vencer", "vencida", "em_renovacao", "nao_aplicavel", "encerrada",
]);
export const DOCUMENT_TYPES = Object.freeze(["licenca", "certidao", "seguro", "alvara", "outro"]);
/** Tipos de REFERÊNCIA. Nenhum deles significa arquivo armazenado. */
export const REFERENCE_TYPES = Object.freeze([
  "referencia_declarada", "protocolo_interno", "registro_externo_declarado",
]);
export const TASK_ACTIONS = Object.freeze(["start", "complete", "cancel"]);

/** Regra única desta entrega: vencimento na data-base do servidor gera tarefa. */
export const EXPIRY_TASK_RULE = "vencimento_na_data_base_do_servidor";

export const DOCUMENT_BOUNDARY =
  "referencia_declarada_nao_arquivo_verificado: sem upload, bytes, checksum, malware scan, armazenamento verificado ou download";
export const LEGAL_BOUNDARY =
  "fonte_e_aplicabilidade_declaradas_pela_equipe: sem validacao juridica e sem confirmacao por orgao publico";
export const CONTINUOUS_MONITORING_NOTE =
  "nao existe execucao agendada nesta entrega: a avaliacao temporal e uma operacao administrativa explicita e o monitoramento continuo exige agendamento futuro";

/**
 * Projeção MÍNIMA de listagem. Sem storage_key, sem file_url, sem referência
 * declarada e sem número documental completo.
 */
const DOCUMENT_LIST_FIELDS = Object.freeze([
  "id", "protocol", "title", "compliance_type", "status", "obligation_id", "origin",
  "issue_date", "effective_start_date", "expiry_date", "evaluation_date", "validity_rule",
  "reference_type", "version_no", "is_private", "is_current", "superseded_by",
  "replacement_of", "responsible_identity", "created_at",
]);

/** Detalhe autorizado: allowlist explícita, ainda sem storage_key/file_url. */
const DOCUMENT_DETAIL_FIELDS = Object.freeze([
  ...DOCUMENT_LIST_FIELDS, "description", "issuer", "document_number", "declared_reference",
  "reference_source", "renewal_justification", "superseded_at", "superseded_by_identity",
  "responsible_name", "created_by_identity", "updated_at",
]);

const TASK_FIELDS = Object.freeze([
  "id", "obligation_id", "document_id", "validity_period", "rule", "evaluation_date",
  "due_date", "facts", "responsible_identity", "status", "completion_result",
  "cancellation_justification", "created_by_identity", "started_by_identity",
  "completed_by_identity", "cancelled_by_identity", "created_at", "started_at",
  "completed_at", "cancelled_at",
]);

/**
 * Campos de servidor: se vierem no corpo, a requisição é recusada em vez de
 * ignorada em silêncio. Forjar id, autoria, estado, versão ou contador é erro
 * do chamador, não um detalhe a tolerar.
 */
const SERVER_OWNED_FIELDS = Object.freeze([
  "id", "protocol", "origin", "status", "version_no", "replacement_of", "superseded_by",
  "superseded_at", "superseded_by_identity", "created_by_identity", "updated_by_identity",
  "created_at", "updated_at", "evaluation_date", "base_date", "today", "now", "client_date",
  "is_private", "is_current", "storage_key", "file_url", "file_name", "started_at",
  "completed_at", "cancelled_at", "started_by_identity", "completed_by_identity",
  "cancelled_by_identity", "denominator", "tasks_created", "evaluated", "replayed",
]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  res.end(JSON.stringify(body));
  return true;
}

async function readBody(req) {
  const declared = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw httpError(413, "payload_too_large");
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    // 413 decidido durante a leitura: não acumulamos corpo grande em memória.
    if (total > MAX_BODY_BYTES) throw httpError(413, "payload_too_large");
    chunks.push(chunk);
  }
  if (!total) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw httpError(400, "json_object_required");
  }
  return parsed;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function fingerprintOf(method, pathname, body) {
  return createHash("sha256").update(`${method} ${pathname} ${stableStringify(body)}`).digest("hex");
}

function forgedFields(body, allowed = []) {
  return SERVER_OWNED_FIELDS.filter(
    field => Object.prototype.hasOwnProperty.call(body, field) && !allowed.includes(field),
  );
}

function text(value, min, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

function isoDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejeita 2025-02-31 e amigos: o round-trip tem que bater.
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function pick(row, fields) {
  const out = {};
  for (const field of fields) {
    if (field === "is_current") continue;
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      out[field] = field.endsWith("_date") ? toIsoDate(row[field]) : row[field];
    }
  }
  if (fields.includes("is_current")) out.is_current = row.superseded_by === null && String(row.status) !== "cancelada";
  if (Object.prototype.hasOwnProperty.call(row, "document_number") && !fields.includes("document_number")) {
    delete out.document_number;
  }
  return out;
}

function maskDocumentNumber(value) {
  if (!value) return null;
  const raw = String(value);
  return raw.length <= 4 ? "****" : `****${raw.slice(-4)}`;
}

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  // -------------------------------------------------------------------------
  // Fronteira de autorização. 401 (anônimo) e 403 (papel sem direito) são
  // resolvidos ANTES do roteamento, para que a rota não vire enumerador.
  // -------------------------------------------------------------------------
  async function authorize(req, res) {
    let session = null;
    try {
      session = await requireSession(req);
    } catch {
      session = null;
    }
    if (!session) {
      jsonResponse(res, 401, { error: "admin_session_required", actor_boundary: "staff_interno" });
      return null;
    }
    const role = String(session.role || session.userRole || "").toLowerCase();
    if (!COMPLIANCE_ROLES.includes(role) || !UUID_PATTERN.test(String(session.identityId || ""))) {
      jsonResponse(res, 403, { error: "compliance_role_required", required_roles: COMPLIANCE_ROLES });
      return null;
    }
    return { ...session, role };
  }

  /** Identidade staff ativa e autorizada, travada dentro da transação. */
  async function lockActiveStaff(client, identityId) {
    if (!UUID_PATTERN.test(String(identityId || ""))) return null;
    const found = await client.query(
      `SELECT i.id, i.display_name, p.role
         FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active' AND p.role = ANY($2::text[])
        FOR SHARE OF i`,
      [identityId, COMPLIANCE_RESPONSIBLE_ROLES],
    );
    return found.rows[0] || null;
  }

  /** Data-base SEMPRE do PostgreSQL. O relógio do cliente não decide validade. */
  async function serverDate(client) {
    const found = await client.query("SELECT CURRENT_DATE::text AS today");
    return found.rows[0].today;
  }

  function databaseDenial(error) {
    if (error?.code === "23505") return { status: 409, body: { error: "conflict", constraint: error.constraint || null } };
    if (error?.code === "23503") return { status: 409, body: { error: "related_record_missing", constraint: error.constraint || null } };
    if (error?.code === "23514" || error?.code === "23502") {
      return { status: 400, body: { error: "database_constraint_rejected", constraint: error.constraint || null } };
    }
    if (error?.code === "P0001") return { status: 409, body: { error: "database_guard_rejected", reason: String(error.message || "").slice(0, 200) } };
    return null;
  }

  // -------------------------------------------------------------------------
  // Transação canônica: BEGIN -> lock/revalidação -> replay -> entidade ->
  // tarefa -> evento imutável -> audit_log -> COMMIT.
  // -------------------------------------------------------------------------
  async function runMutation(req, res, session, options, work) {
    if (!sameOrigin(req)) return jsonResponse(res, 403, { error: "cross_origin_rejected" });
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      return jsonResponse(res, 400, { error: "idempotency_key_required" });
    }
    let body;
    try {
      // O corpo é lido UMA vez e só aqui.
      body = await readBody(req);
    } catch (error) {
      return jsonResponse(res, error.status || 400, { error: error.message });
    }
    const forged = forgedFields(body, options.allow || []);
    if (forged.length) {
      return jsonResponse(res, 400, { error: "server_owned_field_rejected", fields: forged });
    }
    const fingerprint = fingerprintOf(req.method, options.pathname, body);

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // Serializa a MESMA chave da MESMA identidade: concorrência real não
      // duplica entidade nem evento.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        "ext07_compliance", `${session.identityId}:${key}`,
      ]);
      const actor = await lockActiveStaff(client, session.identityId);
      if (!actor) {
        await client.query("ROLLBACK");
        return jsonResponse(res, 403, { error: "staff_identity_not_authorized" });
      }
      const prior = await client.query(
        `SELECT payload, request_fingerprint FROM ext_compliance_events
          WHERE created_by_identity = $1 AND idempotency_key = $2`,
        [session.identityId, key],
      );
      if (prior.rows.length) {
        const stored = prior.rows[0];
        if (stored.request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return jsonResponse(res, 409, { error: "idempotency_key_reused_with_different_payload" });
        }
        await client.query("COMMIT");
        return jsonResponse(res, 200, { ...stored.payload, replayed: true });
      }

      let outcome;
      try {
        outcome = await work(client, body, actor);
      } catch (error) {
        const denial = databaseDenial(error);
        if (!denial) throw error;
        await client.query("ROLLBACK");
        return jsonResponse(res, denial.status, denial.body);
      }
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return jsonResponse(res, outcome.deny.status, outcome.deny.body);
      }

      await client.query(
        `INSERT INTO ext_compliance_events
           (obligation_id, document_id, task_id, event_type, payload, idempotency_key, request_fingerprint, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          outcome.obligationId || null, outcome.documentId || null, outcome.taskId || null,
          outcome.eventType, JSON.stringify(outcome.body), key, fingerprint, session.identityId,
        ],
      );

      try {
        // Auditoria canônica: nada de helper tolerante a falha aqui.
        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          [outcome.auditAction, session.identityId, String(outcome.target || ""),
            JSON.stringify({ ...(outcome.auditMeta || {}), idempotency_key: key, journey: "ext07_compliance" })],
        );
      } catch (auditError) {
        // Auditoria indisponível NÃO vira sucesso: nada permanece gravado.
        await client.query("ROLLBACK").catch(() => {});
        console.error("EXT-07 audit_log unavailable; mutation rolled back.", auditError?.message);
        return jsonResponse(res, 503, { error: "audit_log_unavailable" });
      }

      await client.query("COMMIT");
      return jsonResponse(res, outcome.status || 200, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      const denial = databaseDenial(error);
      if (denial) return jsonResponse(res, denial.status, denial.body);
      console.error("EXT-07 mutation failed.", error?.message);
      return jsonResponse(res, 503, { error: "compliance_journey_unavailable" });
    } finally {
      client?.release();
    }
  }

  // -------------------------------------------------------------------------
  // Leituras
  // -------------------------------------------------------------------------
  async function listObligations(req, res) {
    const client = await pool.connect();
    try {
      const today = await serverDate(client);
      const found = await client.query(
        `SELECT o.id, o.obligation_type, o.title, o.description, o.declared_source,
                o.applicability_scope, o.applicability_justification, o.validity_rule,
                o.renewal_lead_days, o.criticality, o.status, o.responsible_identity,
                i.display_name AS responsible_name, o.created_by_identity, o.created_at, o.updated_at
           FROM ext_compliance_obligations o
           JOIN auth_identities i ON i.id = o.responsible_identity
          ORDER BY o.created_at DESC
          LIMIT 200`,
      );
      return jsonResponse(res, 200, {
        items: found.rows,
        source: "ext_compliance_obligations",
        base_date: today,
        base_date_source: "postgres_current_date",
        denominator: found.rowCount,
        absence_is_not_zero: found.rowCount === 0,
        absence_note: "lista vazia significa ausencia de registro declarado, nao ausencia de obrigacao ou de risco",
        legal_validation: "nao_realizada",
        legal_validation_note: LEGAL_BOUNDARY,
      });
    } finally {
      client.release();
    }
  }

  async function listDocuments(req, res) {
    const client = await pool.connect();
    try {
      const today = await serverDate(client);
      const found = await client.query(
        `SELECT * FROM ext_compliance_documents
          WHERE origin = 'ext07_canonica'
          ORDER BY expiry_date ASC NULLS LAST, created_at DESC
          LIMIT 200`,
      );
      const items = found.rows.map(row => ({
        ...pick(row, DOCUMENT_LIST_FIELDS),
        document_number_masked: maskDocumentNumber(row.document_number),
      }));
      return jsonResponse(res, 200, {
        items,
        source: "ext_compliance_documents (origin=ext07_canonica)",
        legacy_rows_excluded: "registro_legado permanece apenas nas rotas legadas de leitura",
        base_date: today,
        base_date_source: "postgres_current_date",
        denominator: found.rowCount,
        absence_is_not_zero: found.rowCount === 0,
        projection: "minimizada",
        withheld_fields: ["storage_key", "file_url", "declared_reference", "document_number"],
        file_boundary: DOCUMENT_BOUNDARY,
      });
    } finally {
      client.release();
    }
  }

  async function documentDetail(req, res, id) {
    if (!UUID_PATTERN.test(id)) return jsonResponse(res, 400, { error: "invalid_document_id" });
    const found = await pool.query(
      `SELECT d.*, i.display_name AS responsible_name
         FROM ext_compliance_documents d
         LEFT JOIN auth_identities i ON i.id = d.responsible_identity
        WHERE d.id = $1 AND d.origin = 'ext07_canonica'`,
      [id],
    );
    if (!found.rows.length) return jsonResponse(res, 404, { error: "document_not_found" });
    const history = await pool.query(
      `SELECT id, version_no, issue_date, effective_start_date, expiry_date, status,
              replacement_of, superseded_by, superseded_at, renewal_justification, created_at
         FROM ext_compliance_documents
        WHERE obligation_id = $1 AND origin = 'ext07_canonica'
        ORDER BY version_no ASC`,
      [found.rows[0].obligation_id],
    );
    return jsonResponse(res, 200, {
      document: pick(found.rows[0], DOCUMENT_DETAIL_FIELDS),
      history: history.rows.map(row => ({
        ...row,
        issue_date: toIsoDate(row.issue_date),
        effective_start_date: toIsoDate(row.effective_start_date),
        expiry_date: toIsoDate(row.expiry_date),
      })),
      projection: "detalhe_autorizado_allowlist",
      withheld_fields: ["storage_key", "file_url"],
      file_boundary: DOCUMENT_BOUNDARY,
    });
  }

  async function listTasks(req, res) {
    const client = await pool.connect();
    try {
      const today = await serverDate(client);
      const found = await client.query(
        `SELECT * FROM ext_compliance_tasks ORDER BY due_date ASC, created_at DESC LIMIT 200`,
      );
      const items = found.rows.map(row => pick(row, TASK_FIELDS));
      const open = items.filter(task => task.status === "aberta" || task.status === "em_andamento").length;
      return jsonResponse(res, 200, {
        items,
        source: "ext_compliance_tasks",
        rule_catalog: [EXPIRY_TASK_RULE],
        base_date: today,
        base_date_source: "postgres_current_date",
        denominator: found.rowCount,
        open_tasks: open,
        absence_is_not_zero: found.rowCount === 0,
        absence_note: "sem tarefa registrada nao significa ausencia de vencimento: a avaliacao temporal e explicita",
        continuous_monitoring: CONTINUOUS_MONITORING_NOTE,
      });
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Mutações
  // -------------------------------------------------------------------------
  function createObligation(req, res, session) {
    return runMutation(req, res, session, {
      pathname: "/api/ext/compliance/obligations",
      allow: [],
    }, async (client, body, actor) => {
      const obligationType = text(body.obligation_type, 3, 100);
      const title = text(body.title, 5, 200);
      const description = text(body.description, 10, 2000);
      const declaredSource = text(body.declared_source, 5, 1000);
      const scope = text(body.applicability_scope, 3, 500);
      const justification = text(body.applicability_justification, 10, 2000);
      const validityRule = text(body.validity_rule, 5, 500);
      if (!obligationType || !OBLIGATION_TYPES.includes(obligationType)) {
        return { deny: { status: 400, body: { error: "invalid_obligation_type", accepted: OBLIGATION_TYPES } } };
      }
      if (!title || !description || !declaredSource || !scope || !justification || !validityRule) {
        return { deny: { status: 400, body: { error: "invalid_obligation_payload" } } };
      }
      const criticality = OBLIGATION_CRITICALITIES.includes(body.criticality) ? body.criticality : "media";
      const leadDays = Number.isInteger(body.renewal_lead_days) && body.renewal_lead_days >= 0 && body.renewal_lead_days <= 3650
        ? body.renewal_lead_days
        : 30;
      if (!UUID_PATTERN.test(String(body.responsible_identity || ""))) {
        return { deny: { status: 400, body: { error: "invalid_responsible_identity" } } };
      }
      const responsible = await lockActiveStaff(client, body.responsible_identity);
      if (!responsible) {
        return {
          deny: {
            status: 409,
            body: { error: "responsible_staff_required", required_roles: COMPLIANCE_RESPONSIBLE_ROLES },
          },
        };
      }
      const inserted = await client.query(
        `INSERT INTO ext_compliance_obligations
           (obligation_type, title, description, declared_source, applicability_scope,
            applicability_justification, validity_rule, renewal_lead_days, criticality,
            responsible_identity, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, obligation_type, title, description, declared_source, applicability_scope,
                   applicability_justification, validity_rule, renewal_lead_days, criticality,
                   status, responsible_identity, created_by_identity, created_at, updated_at`,
        [obligationType, title, description, declaredSource, scope, justification, validityRule,
          leadDays, criticality, responsible.id, actor.id],
      );
      const obligation = inserted.rows[0];
      return {
        status: 201,
        body: {
          obligation,
          responsible_name: responsible.display_name,
          legal_validation: "nao_realizada",
          legal_validation_note: LEGAL_BOUNDARY,
        },
        obligationId: obligation.id,
        eventType: "obligation_created",
        auditAction: "ext07_obligation_create",
        target: obligation.id,
        auditMeta: { obligation_type: obligationType, criticality },
      };
    });
  }

  function createDocument(req, res, session) {
    return runMutation(req, res, session, {
      pathname: "/api/ext/compliance/documents",
      allow: [],
    }, async (client, body, actor) => {
      if (!UUID_PATTERN.test(String(body.obligation_id || ""))) {
        return { deny: { status: 400, body: { error: "invalid_obligation_id" } } };
      }
      const obligation = (await client.query(
        `SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE`,
        [body.obligation_id],
      )).rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      if (["encerrada", "nao_aplicavel"].includes(String(obligation.status))) {
        return { deny: { status: 409, body: { error: "obligation_not_active", status: obligation.status } } };
      }
      // Fail-closed: sem responsável staff ativo não existe documento canônico.
      const responsible = await lockActiveStaff(client, obligation.responsible_identity);
      if (!responsible) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing", fail_closed: true } } };
      }

      const title = text(body.title, 5, 200);
      const description = text(body.description, 10, 2000);
      const declaredReference = text(body.declared_reference, 3, 1000);
      const referenceSource = text(body.reference_source, 3, 500);
      const referenceType = text(body.reference_type, 3, 100);
      const complianceType = DOCUMENT_TYPES.includes(body.compliance_type) ? body.compliance_type : null;
      if (!title || !description) return { deny: { status: 400, body: { error: "invalid_document_payload" } } };
      if (!complianceType) {
        return { deny: { status: 400, body: { error: "invalid_compliance_type", accepted: DOCUMENT_TYPES } } };
      }
      if (!declaredReference || !referenceType || !REFERENCE_TYPES.includes(referenceType)) {
        return {
          deny: {
            status: 400,
            body: { error: "declared_reference_required", accepted_reference_types: REFERENCE_TYPES, file_boundary: DOCUMENT_BOUNDARY },
          },
        };
      }

      const issueDate = isoDate(body.issue_date);
      const expiryDate = isoDate(body.expiry_date);
      const startDate = body.effective_start_date === undefined ? issueDate : isoDate(body.effective_start_date);
      if (!issueDate || !expiryDate || !startDate) {
        return { deny: { status: 400, body: { error: "invalid_dates", expected_format: "AAAA-MM-DD" } } };
      }
      if (startDate < issueDate) {
        return { deny: { status: 400, body: { error: "effective_start_before_issue" } } };
      }
      if (expiryDate < issueDate || expiryDate < startDate) {
        return { deny: { status: 400, body: { error: "expiry_before_issue_or_start" } } };
      }

      const today = await serverDate(client);
      const leadLimit = (await client.query(
        "SELECT ($1::date + ($2::int * INTERVAL '1 day'))::date::text AS limit_date",
        [today, obligation.renewal_lead_days],
      )).rows[0].limit_date;
      // Estado temporal derivado do relógio do PostgreSQL, nunca do cliente.
      const status = expiryDate <= today ? "vencida" : (expiryDate <= leadLimit ? "a_vencer" : "vigente");
      const protocol = `COMP-EXT-${today.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;

      const inserted = await client.query(
        `INSERT INTO ext_compliance_documents
           (protocol, title, description, compliance_type, status, document_number, issuer,
            responsible_name, responsible_identity, issue_date, effective_start_date, expiry_date,
            validity_rule, evaluation_date, reference_type, declared_reference, reference_source,
            is_private, created_by_identity, obligation_id, origin, version_no)
         VALUES ($1,$2,$3,$4::ext_compliance_type,$5::ext_compliance_status,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,$18,$19,'ext07_canonica',1)
         RETURNING *`,
        [protocol, title, description, complianceType, status, text(body.document_number, 3, 200),
          text(body.issuer, 3, 200), responsible.display_name, responsible.id, issueDate, startDate,
          expiryDate, obligation.validity_rule, today, referenceType, declaredReference, referenceSource,
          actor.id, obligation.id],
      );
      const document = inserted.rows[0];
      return {
        status: 201,
        body: {
          document: pick(document, DOCUMENT_DETAIL_FIELDS),
          validity: {
            rule: obligation.validity_rule,
            base_date: today,
            base_date_source: "postgres_current_date",
            renewal_lead_days: obligation.renewal_lead_days,
            derived_status: status,
          },
          privacy: { is_private: true, enforced_by: "migration_154_check_ext_compliance_canonical_private" },
          file_boundary: DOCUMENT_BOUNDARY,
        },
        obligationId: obligation.id,
        documentId: document.id,
        eventType: "document_created",
        auditAction: "ext07_document_create",
        target: document.id,
        auditMeta: { obligation_id: obligation.id, derived_status: status },
      };
    });
  }

  function renewDocument(req, res, session, id) {
    return runMutation(req, res, session, {
      pathname: `/api/ext/compliance/documents/${id}/renew`,
      allow: [],
    }, async (client, body, actor) => {
      if (!UUID_PATTERN.test(id)) return { deny: { status: 400, body: { error: "invalid_document_id" } } };
      const previous = (await client.query(
        `SELECT * FROM ext_compliance_documents WHERE id = $1 AND origin = 'ext07_canonica' FOR UPDATE`,
        [id],
      )).rows[0];
      if (!previous) return { deny: { status: 404, body: { error: "document_not_found" } } };
      if (previous.superseded_by) {
        return { deny: { status: 409, body: { error: "document_already_superseded", superseded_by: previous.superseded_by } } };
      }
      if (String(previous.status) === "cancelada") {
        return { deny: { status: 409, body: { error: "terminal_document_cannot_renew" } } };
      }
      const justification = text(body.renewal_justification, 10, 2000);
      if (!justification) return { deny: { status: 400, body: { error: "renewal_justification_required" } } };

      const obligation = (await client.query(
        `SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE`,
        [previous.obligation_id],
      )).rows[0];
      if (!obligation) return { deny: { status: 409, body: { error: "obligation_not_found" } } };
      const responsible = await lockActiveStaff(client, obligation.responsible_identity);
      if (!responsible) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing", fail_closed: true } } };
      }

      const issueDate = isoDate(body.issue_date);
      const expiryDate = isoDate(body.expiry_date);
      const startDate = body.effective_start_date === undefined ? issueDate : isoDate(body.effective_start_date);
      if (!issueDate || !expiryDate || !startDate) {
        return { deny: { status: 400, body: { error: "invalid_dates", expected_format: "AAAA-MM-DD" } } };
      }
      if (startDate < issueDate || expiryDate < issueDate || expiryDate < startDate) {
        return { deny: { status: 400, body: { error: "expiry_before_issue_or_start" } } };
      }
      const previousExpiry = toIsoDate(previous.expiry_date);
      if (previousExpiry && expiryDate <= previousExpiry) {
        // Renovar é avançar a validade; repetir o mesmo vencimento é sobrescrita disfarçada.
        return { deny: { status: 409, body: { error: "renewal_must_extend_validity", previous_expiry_date: previousExpiry } } };
      }

      const declaredReference = text(body.declared_reference, 3, 1000) || previous.declared_reference;
      const referenceType = text(body.reference_type, 3, 100) || previous.reference_type;
      if (!REFERENCE_TYPES.includes(referenceType)) {
        return { deny: { status: 400, body: { error: "invalid_reference_type", accepted: REFERENCE_TYPES } } };
      }

      const today = await serverDate(client);
      const leadLimit = (await client.query(
        "SELECT ($1::date + ($2::int * INTERVAL '1 day'))::date::text AS limit_date",
        [today, obligation.renewal_lead_days],
      )).rows[0].limit_date;
      const status = expiryDate <= today ? "vencida" : (expiryDate <= leadLimit ? "a_vencer" : "vigente");
      const protocol = `COMP-EXT-${today.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;

      // A ordem importa. O índice único de versão atual (154) considera atual
      // toda linha canônica não substituída e não cancelada. Se a nova versão
      // nascesse antes da marca de substituição, as duas seriam "atuais" ao
      // mesmo tempo e o banco rejeitaria a renovação legítima. Por isso o id da
      // nova versão é decidido aqui, a substituição é gravada primeiro e a FK
      // `superseded_by` é DEFERRABLE INITIALLY DEFERRED.
      const nextId = randomUUID();

      // 1) O registro anterior NÃO é alterado no conteúdo: só recebe a marca de
      //    substituição formal, com autor e carimbo do servidor.
      await client.query(
        `UPDATE ext_compliance_documents
            SET superseded_by = $2, superseded_at = NOW(), superseded_by_identity = $3, updated_at = NOW()
          WHERE id = $1`,
        [previous.id, nextId, actor.id],
      );

      // 2) Nova versão é um REGISTRO NOVO vinculado à anterior.
      const inserted = await client.query(
        `INSERT INTO ext_compliance_documents
           (id, protocol, title, description, compliance_type, status, document_number, issuer,
            responsible_name, responsible_identity, issue_date, effective_start_date, expiry_date,
            validity_rule, evaluation_date, reference_type, declared_reference, reference_source,
            is_private, created_by_identity, obligation_id, origin, version_no, replacement_of,
            renewal_justification)
         VALUES ($1,$2,$3,$4,$5::ext_compliance_type,$6::ext_compliance_status,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true,$19,$20,'ext07_canonica',$21,$22,$23)
         RETURNING *`,
        [nextId, protocol, text(body.title, 5, 200) || previous.title,
          text(body.description, 10, 2000) || previous.description,
          previous.compliance_type, status, text(body.document_number, 3, 200) || previous.document_number,
          text(body.issuer, 3, 200) || previous.issuer, responsible.display_name, responsible.id,
          issueDate, startDate, expiryDate, obligation.validity_rule, today, referenceType,
          declaredReference, text(body.reference_source, 3, 500) || previous.reference_source,
          actor.id, obligation.id, Number(previous.version_no) + 1, previous.id, justification],
      );
      const document = inserted.rows[0];

      return {
        status: 201,
        body: {
          document: pick(document, DOCUMENT_DETAIL_FIELDS),
          previous_version: {
            id: previous.id, version_no: previous.version_no, expiry_date: previousExpiry,
            preserved: true, superseded_by: document.id,
          },
          renewal: { justification, author_identity: actor.id, author_source: "sessao_staff" },
          file_boundary: DOCUMENT_BOUNDARY,
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

  function evaluateExpiry(req, res, session) {
    return runMutation(req, res, session, {
      pathname: "/api/ext/compliance/evaluate",
      allow: [],
    }, async (client, body, actor) => {
      const today = await serverDate(client);
      const documents = (await client.query(
        `SELECT d.*, o.renewal_lead_days, o.responsible_identity AS obligation_responsible, o.title AS obligation_title
           FROM ext_compliance_documents d
           JOIN ext_compliance_obligations o ON o.id = d.obligation_id
          WHERE d.origin = 'ext07_canonica'
            AND d.superseded_by IS NULL
            AND d.status::text <> 'cancelada'
            AND d.expiry_date IS NOT NULL
          ORDER BY d.expiry_date ASC
          FOR UPDATE OF d`,
      )).rows;

      let created = 0;
      let existing = 0;
      let expired = 0;
      let dueSoon = 0;
      const facts = [];

      for (const document of documents) {
        const expiry = toIsoDate(document.expiry_date);
        const start = toIsoDate(document.effective_start_date) || toIsoDate(document.issue_date);
        const leadLimit = (await client.query(
          "SELECT ($1::date + ($2::int * INTERVAL '1 day'))::date::text AS limit_date",
          [today, document.renewal_lead_days],
        )).rows[0].limit_date;

        if (expiry > today) {
          const nextStatus = expiry <= leadLimit ? "a_vencer" : "vigente";
          if (nextStatus === "a_vencer") dueSoon += 1;
          if (String(document.status) !== nextStatus) {
            await client.query(
              `UPDATE ext_compliance_documents SET status = $2::ext_compliance_status, evaluation_date = $3, updated_at = NOW() WHERE id = $1`,
              [document.id, nextStatus, today],
            );
          }
          continue;
        }

        // VENCIMENTO: gera tarefa. Sem responsável staff ativo, falha FECHADA.
        expired += 1;
        const responsible = await lockActiveStaff(client, document.obligation_responsible);
        if (!responsible) {
          return {
            deny: {
              status: 409,
              body: {
                error: "responsible_staff_missing",
                fail_closed: true,
                document_id: document.id,
                note: "avaliacao abortada: tarefa de vencimento sem responsavel canonico nao e criada",
              },
            },
          };
        }
        const validityPeriod = `${start}:${expiry}`;
        const daysOverdue = (await client.query(
          "SELECT ($1::date - $2::date) AS days",
          [today, expiry],
        )).rows[0].days;
        const taskFacts = {
          rule: EXPIRY_TASK_RULE,
          base_date: today,
          base_date_source: "postgres_current_date",
          expiry_date: expiry,
          effective_start_date: start,
          validity_rule: document.validity_rule,
          renewal_lead_days: document.renewal_lead_days,
          days_overdue: Number(daysOverdue),
        };
        const task = (await client.query(
          `INSERT INTO ext_compliance_tasks
             (obligation_id, document_id, validity_period, rule, evaluation_date, due_date, facts,
              responsible_identity, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (document_id, validity_period, rule) DO NOTHING
           RETURNING id`,
          [document.obligation_id, document.id, validityPeriod, EXPIRY_TASK_RULE, today, expiry,
            JSON.stringify(taskFacts), responsible.id, actor.id],
        )).rows[0];
        if (task) created += 1; else existing += 1;
        if (String(document.status) !== "vencida") {
          await client.query(
            `UPDATE ext_compliance_documents SET status = 'vencida'::ext_compliance_status, evaluation_date = $2, updated_at = NOW() WHERE id = $1`,
            [document.id, today],
          );
        }
        facts.push({ document_id: document.id, validity_period: validityPeriod, ...taskFacts });
      }

      return {
        status: 200,
        body: {
          source: "ext_compliance_documents (origin=ext07_canonica) + ext_compliance_tasks",
          task_source: "ext_compliance_tasks",
          rule: EXPIRY_TASK_RULE,
          base_date: today,
          base_date_source: "postgres_current_date",
          denominator: documents.length,
          evaluated: documents.length,
          expired,
          due_soon: dueSoon,
          tasks_created: created,
          tasks_already_present: existing,
          absence_is_not_zero: documents.length === 0,
          absence_note: "denominador zero significa ausencia de documento canonico avaliavel, nao conformidade comprovada",
          facts,
          continuous_monitoring: CONTINUOUS_MONITORING_NOTE,
        },
        eventType: "expiry_evaluated",
        auditAction: "ext07_expiry_evaluate",
        target: `base_date:${today}`,
        auditMeta: { evaluated: documents.length, tasks_created: created },
      };
    });
  }

  function transitionTask(req, res, session, id, action) {
    return runMutation(req, res, session, {
      pathname: `/api/ext/compliance/tasks/${id}/${action}`,
      allow: [],
    }, async (client, body, actor) => {
      if (!UUID_PATTERN.test(id)) return { deny: { status: 400, body: { error: "invalid_task_id" } } };
      const task = (await client.query(`SELECT * FROM ext_compliance_tasks WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
      if (["concluida", "cancelada"].includes(String(task.status))) {
        return { deny: { status: 409, body: { error: "terminal_task_cannot_reopen", status: task.status } } };
      }
      if (action === "start" && String(task.status) !== "aberta") {
        return { deny: { status: 409, body: { error: "invalid_transition", from: task.status, to: "em_andamento" } } };
      }

      let nextStatus;
      let result = null;
      let justification = null;
      if (action === "start") {
        nextStatus = "em_andamento";
      } else if (action === "complete") {
        result = text(body.result, 10, 2000);
        if (!result) return { deny: { status: 400, body: { error: "completion_result_required" } } };
        // Fail-closed: concluir exige responsável canônico ainda ativo.
        const responsible = await lockActiveStaff(client, task.responsible_identity);
        if (!responsible) {
          return { deny: { status: 409, body: { error: "completion_requires_active_responsible", fail_closed: true } } };
        }
        nextStatus = "concluida";
      } else {
        justification = text(body.justification, 10, 1000);
        if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
        nextStatus = "cancelada";
      }

      const updated = (await client.query(
        `UPDATE ext_compliance_tasks
            SET status = $2,
                completion_result = COALESCE($3, completion_result),
                cancellation_justification = COALESCE($4, cancellation_justification),
                started_at = CASE WHEN $2 = 'em_andamento' THEN NOW() ELSE started_at END,
                started_by_identity = CASE WHEN $2 = 'em_andamento' THEN $5 ELSE started_by_identity END,
                completed_at = CASE WHEN $2 = 'concluida' THEN NOW() ELSE completed_at END,
                completed_by_identity = CASE WHEN $2 = 'concluida' THEN $5 ELSE completed_by_identity END,
                cancelled_at = CASE WHEN $2 = 'cancelada' THEN NOW() ELSE cancelled_at END,
                cancelled_by_identity = CASE WHEN $2 = 'cancelada' THEN $5 ELSE cancelled_by_identity END
          WHERE id = $1
          RETURNING *`,
        [id, nextStatus, result, justification, actor.id],
      )).rows[0];

      return {
        status: 200,
        body: {
          task: pick(updated, TASK_FIELDS),
          transition: { from: task.status, to: nextStatus, author_identity: actor.id, author_source: "sessao_staff" },
        },
        obligationId: task.obligation_id,
        documentId: task.document_id,
        taskId: task.id,
        eventType: `task_${action}`,
        auditAction: `ext07_task_${action}`,
        target: task.id,
        auditMeta: { from: task.status, to: nextStatus },
      };
    });
  }

  // -------------------------------------------------------------------------
  // Roteamento. Autorização primeiro; nenhuma rota pública.
  // -------------------------------------------------------------------------
  async function handle(req, res) {
    const pathname = new URL(req.url || "/", "http://internal.invalid").pathname;
    const session = await authorize(req, res);
    if (!session) return true;
    const method = req.method || "GET";

    if (pathname === "/api/ext/compliance/obligations") {
      if (method === "GET") return listObligations(req, res);
      if (method === "POST") return createObligation(req, res, session);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["GET", "POST"] });
    }
    if (pathname === "/api/ext/compliance/documents") {
      if (method === "GET") return listDocuments(req, res);
      if (method === "POST") return createDocument(req, res, session);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["GET", "POST"] });
    }
    if (pathname === "/api/ext/compliance/tasks") {
      if (method === "GET") return listTasks(req, res);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["GET"] });
    }
    if (pathname === "/api/ext/compliance/evaluate") {
      if (method === "POST") return evaluateExpiry(req, res, session);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["POST"] });
    }

    const renewal = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/);
    if (renewal) {
      if (method === "POST") return renewDocument(req, res, session, renewal[1]);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["POST"] });
    }
    const detail = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/);
    if (detail) {
      if (method === "GET") return documentDetail(req, res, detail[1]);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["GET"] });
    }
    const task = pathname.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/([a-z]+)$/);
    if (task) {
      if (!TASK_ACTIONS.includes(task[2])) {
        return jsonResponse(res, 404, { error: "not_found", allowed_actions: TASK_ACTIONS });
      }
      if (method === "POST") return transitionTask(req, res, session, task[1], task[2]);
      return jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["POST"] });
    }

    return jsonResponse(res, 404, { error: "not_found" });
  }

  return { handle };
}
