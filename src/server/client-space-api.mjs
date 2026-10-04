// API do espaço do cliente (etapa 2): cadastro central, vínculos verificados,
// contratos, documentos privados e chamados — com dados reais em PostgreSQL.
//
// Invariantes aplicados (docs/portal-acesso-e-seguranca.md):
// - negar por padrão: toda leitura/escrita exige sessão (cliente ou administrativa);
// - o escopo por conta é verificado no servidor em CADA requisição, via
//   client_access_grants ativo; nunca confiamos em IDs vindos do navegador;
// - separar identidade de vínculo: login válido não prova representar o cliente;
// - concessão/revogação de vínculo exige motivo obrigatório e é auditada;
// - nenhum dado fictício é criado: a administração cadastra os dados reais.
// - documentos vivem fora do banco, em armazenamento privado (ctx.docsDir); cada
//   download revalida o vínculo e é auditado.

import { mkdir, stat, writeFile, readFile, unlink } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import path from "node:path";
import {
  MAX_DOCUMENT_BYTES,
  TEXT_LIMITS,
  isAccountStatus,
  isContractStatus,
  isReportStatus,
  isTicketStatus,
  isVisitStatus,
  validateAccountInput,
  validateContractInput,
  validateDocumentMeta,
  validateReason,
  validateScopeNote,
  validateTicketInput,
  validateTicketReopenReason,
  validateTicketServiceNote,
  validateVisitInput,
  validateVisitReschedule,
  validateReportInput,
  validateReportNote,
  isTicketServiceTransitionAllowed,
  isTicketServiceReopen,
} from "../lib/client-space-core.mjs";
import { PUBLIC_SERVICES } from "../lib/service-catalog.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_BODY_LIMIT = 15 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{48}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

class AuditUnavailableError extends Error {
  constructor(cause) {
    super("AUDIT_UNAVAILABLE", { cause });
    this.name = "AuditUnavailableError";
    this.code = "AUDIT_UNAVAILABLE";
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown";
}

function idempotencyKey(req) {
  const value = String(req.headers["idempotency-key"] || "").trim();
  return IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isValidServiceName(value) {
  return PUBLIC_SERVICES.some(service => service.name === value);
}

export function createClientSpaceApi(ctx) {
  function databaseFailure(res, error, context) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && ["42P01", "42703"].includes(error.code);
    const auditUnavailable = error instanceof AuditUnavailableError || (error && typeof error === "object" && error.code === "AUDIT_UNAVAILABLE");
    const generic = {
      error: auditUnavailable
        ? "audit_unavailable"
        : unconfigured
          ? "database_not_configured"
          : migrationMissing
            ? "migration_required"
            : "client_space_unavailable",
    };
    if (!unconfigured && !migrationMissing && !auditUnavailable) console.error(context, errorMessage(error));
    return ctx.json(res, 503, generic);
  }

  async function audit(db, { actorKind, actorId = null, action, target = null, result, category = "none" }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind, actorId, action, target, result, category],
      );
    } catch (error) {
      console.error("Could not record client space audit.", { action, message: errorMessage(error) });
      throw new AuditUnavailableError(error);
    }
  }

  async function auditOr503(db, res, event) {
    try {
      await audit(db, event);
      return true;
    } catch (error) {
      databaseFailure(res, error, "Could not record the mandatory client-space audit.");
      return false;
    }
  }

  async function rollback(client) {
    if (client) await client.query("ROLLBACK").catch(() => {});
  }

  async function transaction(db, work) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  function requireMethod(req, res, allowed) {
    if (allowed.includes(req.method)) return true;
    ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: allowed.join(", ") });
    return false;
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function readJsonOr400(req, res, limit) {
    try {
      return await ctx.readJson(req, limit);
    } catch (error) {
      ctx.json(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "invalid_request" });
      return undefined;
    }
  }

  async function requireAdminSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    // The legacy account/grant schema only accepts these two roles as actors.
    // In particular, a valid RH cookie must never expose client accounts.
    if (!["marcelo", "ti"].includes(session.role)) {
      ctx.json(res, 403, { error: "forbidden" });
      return null;
    }
    if (!session.identityId) {
      ctx.json(res, 403, { error: "individual_staff_required" });
      return null;
    }
    return session;
  }

  async function requireClientSession(req, res) {
    const session = await ctx.readClientSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "client_session_required" });
      return null;
    }
    return session;
  }

  // Escopo por conta em cada requisição: o vínculo precisa existir e estar ativo,
  // com a conta em situação normal. Respostas de recusa são genéricas por padrão.
  async function requireAccountScope(db, { req, res, session, accountId, action }) {
    let result;
    try {
      result = await db.query(
        `SELECT g.id
         FROM client_access_grants g
         JOIN client_accounts a ON a.id = g.client_account_id
         WHERE g.identity_id = $1 AND g.client_account_id = $2
           AND g.revoked_at IS NULL AND a.status = 'active'`,
        [session.identityId, accountId],
      );
    } catch (error) {
      databaseFailure(res, error, "Could not verify the client account scope.");
      return null;
    }
    if (!result.rows[0]) {
      if (!await auditOr503(db, res, {
        actorKind: "client",
        actorId: session.identityId,
        action,
        target: accountId,
        result: "denied",
        category: "authorization_denied",
      })) return null;
      ctx.json(res, 403, { error: "forbidden" });
      return null;
    }
    // Vínculo restrito por unidade: qualquer erro na releitura do grant ou na
    // consulta da unidade deve impedir o acesso, não tratá-lo como irrestrito.
    let unitGrant;
    let unitAllowed = true;
    try {
      const grant = await db.query(
        `SELECT g.unit_account_id FROM client_access_grants g
         WHERE g.id = $1 AND g.identity_id = $2 AND g.client_account_id = $3 AND g.revoked_at IS NULL`,
        [result.rows[0].id, session.identityId, accountId],
      );
      unitGrant = grant.rows[0];
      if (unitGrant?.unit_account_id) {
        const unitCheck = await db.query(
          `SELECT id FROM client_accounts WHERE id = $1 AND (id = $2 OR parent_account_id = $2)`,
          [accountId, unitGrant.unit_account_id],
        );
        unitAllowed = Boolean(unitCheck.rows[0]);
      }
    } catch (error) {
      databaseFailure(res, error, "Could not verify the client unit scope.");
      return null;
    }
    if (!unitGrant || !unitAllowed) {
      if (!await auditOr503(db, res, { actorKind: "client", actorId: session.identityId, action, target: accountId, result: "denied", category: "authorization_denied" })) return null;
      ctx.json(res, 403, { error: "forbidden" });
      return null;
    }
    return result.rows[0].id;
  }

  function paginate(url, res) {
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.min(10_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
    return { limit, offset };
  }

  function optionalUuid(value) {
    const text = String(value || "").trim();
    if (!text) return { value: null };
    if (!UUID_PATTERN.test(text)) return { error: "invalid_uuid" };
    return { value: text };
  }

  function roleActor(session) {
    return session.role === "ti" ? "ti" : "marcelo";
  }

  const LEGACY_TICKET_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

  // F03 — três camadas reais de esquema convivem neste repositório:
  //   legacy     = somente 001–139 (portal CLI-01..05): comportamento preservado;
  //   canonical  = 140 + 158 aplicados: máquina de estados e idempotência;
  //   incomplete = 140 sem 158: recusa fechada, nunca silenciosamente relaxada.
  async function ticketServiceSchemaTier(db) {
    const result = await db.query(
      `SELECT
         (EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'client_tickets' AND column_name = 'reopen_count'
          ) AND to_regclass('public.client_ticket_sla_pauses') IS NOT NULL) AS lifecycle,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'client_ticket_status_audit'
              AND column_name = 'idempotency_key'
         ) AS idempotency`,
    );
    const row = result.rows[0] || {};
    if (!row.lifecycle) return "legacy";
    return row.idempotency ? "canonical" : "incomplete";
  }

  async function ensureAccountExists(db, res, accountId) {
    try {
      const found = await db.query("SELECT id FROM client_accounts WHERE id = $1", [accountId]);
      if (!found.rows[0]) {
        ctx.json(res, 404, { error: "account_not_found" });
        return false;
      }
      return true;
    } catch (error) {
      databaseFailure(res, error, "Could not validate the client account.");
      return false;
    }
  }

  async function validateClientRefs(db, res, { accountId, contractId = null, ticketId = null, visitId = null }) {
    try {
      if (contractId) {
        const contract = await db.query("SELECT id FROM client_contracts WHERE id = $1 AND client_account_id = $2", [contractId, accountId]);
        if (!contract.rows[0]) {
          ctx.json(res, 400, { error: "contract_account_mismatch" });
          return false;
        }
      }
      if (ticketId) {
        const ticket = await db.query("SELECT id FROM client_tickets WHERE id = $1 AND client_account_id = $2", [ticketId, accountId]);
        if (!ticket.rows[0]) {
          ctx.json(res, 400, { error: "ticket_account_mismatch" });
          return false;
        }
      }
      if (visitId) {
        const visit = await db.query("SELECT id FROM client_visits WHERE id = $1 AND client_account_id = $2", [visitId, accountId]);
        if (!visit.rows[0]) {
          ctx.json(res, 400, { error: "visit_account_mismatch" });
          return false;
        }
      }
      return true;
    } catch (error) {
      databaseFailure(res, error, "Could not validate scoped client references.");
      return false;
    }
  }

  async function pauseTicketSla(client, { ticketId, actorKind, actorId, reason = "waiting_client", notes = null }) {
    const inserted = await client.query(
      `INSERT INTO client_ticket_sla_pauses (ticket_id, reason, notes, paused_by, paused_by_identity)
       SELECT $1,$2,$3,$4,$5
       WHERE NOT EXISTS (
         SELECT 1 FROM client_ticket_sla_pauses WHERE ticket_id = $1 AND resumed_at IS NULL
       )
       RETURNING id`,
      [ticketId, reason, notes, actorKind, actorId],
    );
    await client.query(
      "UPDATE client_tickets SET sla_paused_at = COALESCE(sla_paused_at, NOW()), sla_pause_reason = $2 WHERE id = $1",
      [ticketId, reason],
    );
    return inserted.rows[0]?.id ?? null;
  }

  async function resumeTicketSla(client, { ticketId, actorKind, actorId }) {
    const resumed = await client.query(
      `UPDATE client_ticket_sla_pauses
          SET resumed_by = $2, resumed_by_identity = $3, resumed_at = NOW()
        WHERE id = (
          SELECT id FROM client_ticket_sla_pauses
           WHERE ticket_id = $1 AND resumed_at IS NULL
           ORDER BY paused_at DESC LIMIT 1
        )
        RETURNING id, EXTRACT(EPOCH FROM (resumed_at - paused_at))::BIGINT AS paused_seconds`,
      [ticketId, actorKind, actorId],
    );
    const seconds = Number(resumed.rows[0]?.paused_seconds || 0);
    await client.query(
      `UPDATE client_tickets
          SET sla_total_paused_seconds = sla_total_paused_seconds + $2,
              sla_paused_at = NULL,
              sla_pause_reason = NULL
        WHERE id = $1`,
      [ticketId, seconds],
    );
    return resumed.rows[0]?.id ?? null;
  }

  function requireVisitStatus(body, res) {
    const status = String(body?.status || "");
    if (!isVisitStatus(status)) {
      ctx.json(res, 400, { error: "visit_status_invalid" });
      return null;
    }
    return status;
  }

  function requireReportStatus(body, res) {
    const status = String(body?.status || "");
    if (!isReportStatus(status)) {
      ctx.json(res, 400, { error: "report_status_invalid" });
      return null;
    }
    return status;
  }

  // ---------- espaço do cliente autenticado ----------

  async function handleClientAccounts(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    try {
      const result = await ctx.getPool().query(
        `SELECT a.id, a.display_name, a.status, g.scope_note, g.created_at AS linked_at
         FROM client_access_grants g
         JOIN client_accounts a ON a.id = g.client_account_id
         WHERE g.identity_id = $1 AND g.revoked_at IS NULL
         ORDER BY a.display_name`,
        [session.identityId],
      );
      return ctx.json(res, 200, { accounts: result.rows });
    } catch (error) {
      return databaseFailure(res, error, "Could not list the linked client accounts.");
    }
  }

  async function handleClientContracts(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    const accountId = String(url.searchParams.get("account") || "");
    if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    const db = ctx.getPool();
    if (!(await requireAccountScope(db, { req, res, session, accountId, action: "contract_list" }))) return;
    // Restrição de contratos (vínculo restrito) — deny-by-default
    let contractFilter = null;
    try {
      const grantRes = await db.query(
        `SELECT contract_scope_mode, allowed_contract_ids FROM client_access_grants WHERE identity_id = $1 AND client_account_id = $2 AND revoked_at IS NULL`,
        [session.identityId, accountId]
      );
      const g = grantRes.rows[0];
      // Sem linha = grant revogado entre verificações; modo inválido = dado
      // inconsistente. Nenhuma das situações pode virar consulta sem filtro.
      if (!g || !["all", "selected"].includes(g.contract_scope_mode)) {
        if (!await auditOr503(db, res, { actorKind: "client", actorId: session.identityId, action: "contract_list", target: accountId, result: "denied", category: "authorization_denied" })) return;
        return ctx.json(res, 403, { error: "forbidden" });
      }
      if (g.contract_scope_mode === "selected") {
        const allowed = Array.isArray(g.allowed_contract_ids) ? g.allowed_contract_ids : [];
        if (allowed.length === 0) return ctx.json(res, 200, { contracts: [] }); // deny all when empty allowlist
        contractFilter = allowed;
      }
    } catch (error) {
      return databaseFailure(res, error, "Could not verify the client contract scope.");
    }
    try {
      let result;
      if (contractFilter) {
        result = await db.query(
          `SELECT id, title, service, status, starts_on, ends_on, summary, created_at, updated_at
           FROM client_contracts WHERE client_account_id = $1 AND id = ANY($2) ORDER BY created_at DESC`,
          [accountId, contractFilter],
        );
      } else {
        result = await db.query(
          `SELECT id, title, service, status, starts_on, ends_on, summary, created_at, updated_at
           FROM client_contracts WHERE client_account_id = $1 ORDER BY created_at DESC`,
          [accountId],
        );
      }
      return ctx.json(res, 200, { contracts: result.rows });
    } catch (error) {
      return databaseFailure(res, error, "Could not list the client contracts.");
    }
  }

  async function handleClientDocuments(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    const accountId = String(url.searchParams.get("account") || "");
    if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    const db = ctx.getPool();
    if (!(await requireAccountScope(db, { req, res, session, accountId, action: "document_list" }))) return;
    try {
      const result = await db.query(
        `SELECT id, title, category, original_filename, content_type, size_bytes, created_at
         FROM client_documents WHERE client_account_id = $1 ORDER BY created_at DESC`,
        [accountId],
      );
      return ctx.json(res, 200, { documents: result.rows });
    } catch (error) {
      return databaseFailure(res, error, "Could not list the client documents.");
    }
  }

  async function streamDocument({ req, res, document, auditContext }) {
    if (!STORAGE_KEY_PATTERN.test(document.storage_key)) {
      console.error("Invalid storage key pattern on document.", { documentId: document.id });
      return ctx.json(res, 500, { error: "document_unavailable" });
    }
    const filePath = path.join(ctx.docsDir, document.storage_key);
    let fileStat;
    let contents;
    try {
      [fileStat, contents] = await Promise.all([stat(filePath), readFile(filePath)]);
    } catch {
      console.error("Document file missing on private storage.", { documentId: document.id });
      return ctx.json(res, 404, { error: "document_file_missing" });
    }
    // L02 — conferência de integridade antes de entregar um byte. O buffer
    // validado é também o buffer servido, eliminando troca entre hash e stream.
    if (document.content_sha256) {
      const actual = createHash("sha256").update(contents).digest("hex");
      if (fileStat.size !== Number(document.size_bytes) || actual !== document.content_sha256) {
        console.error("Document integrity mismatch on private storage.", { documentId: document.id });
        if (!await auditOr503(ctx.getPool(), res, { ...auditContext, action: "document_download", target: document.id, result: "denied" })) return;
        return ctx.json(res, 409, { error: "document_integrity_failed" });
      }
    }

    // A auditoria obrigatória termina antes de qualquer header ou byte privado.
    // Se ela falhar, auditOr503 emite somente o erro JSON 503.
    if (!await auditOr503(ctx.getPool(), res, { ...auditContext, action: "document_download", target: document.id, result: "allowed" })) return;

    const safeName = document.original_filename.replace(/["\\]/g, "_") || "documento";
    res.writeHead(200, {
      "Content-Type": document.content_type,
      "Content-Length": contents.length,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.original_filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(contents);
  }

  async function handleClientDocumentDownload(req, res, documentId) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(documentId)) return ctx.json(res, 400, { error: "invalid_document_id" });
    const db = ctx.getPool();
    let document;
    try {
      const found = await db.query("SELECT * FROM client_documents WHERE id = $1", [documentId]);
      document = found.rows[0];
    } catch (error) {
      return databaseFailure(res, error, "Could not load the client document.");
    }
    if (!document) return ctx.json(res, 404, { error: "document_not_found" });
    if (!(await requireAccountScope(db, { req, res, session, accountId: document.client_account_id, action: "document_download" }))) return;
    return streamDocument({ req, res, document, auditContext: { actorKind: "client", actorId: session.identityId } });
  }

  async function handleClientTickets(req, res, url) {
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const accountId = String(url.searchParams.get("account") || "");
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const db = ctx.getPool();
      if (!(await requireAccountScope(db, { req, res, session, accountId, action: "ticket_list" }))) return;
      try {
        let result;
        try {
          result = await db.query(
            `SELECT id, category, title, details, status, admin_response, created_at, updated_at,
                    sla_due_at, sla_paused_at, sla_pause_reason, sla_total_paused_seconds,
                    reopen_count, last_reopen_reason, resolved_at, closed_at
             FROM client_tickets WHERE client_account_id = $1 ORDER BY created_at DESC`,
            [accountId],
          );
        } catch (error) {
          if (!error || typeof error !== "object" || error.code !== "42703") throw error;
          // CI gates L08 apply the canonical CLI-01..05 schema through migration 139 only.
          // Keep existing promoted reads green there while migration 140 rolls out.
          result = await db.query(
            `SELECT id, category, title, details, status, admin_response, created_at, updated_at,
                    NULL::timestamptz AS sla_due_at, NULL::timestamptz AS sla_paused_at,
                    NULL::text AS sla_pause_reason, 0::bigint AS sla_total_paused_seconds,
                    0::int AS reopen_count, NULL::text AS last_reopen_reason,
                    NULL::timestamptz AS resolved_at, NULL::timestamptz AS closed_at
             FROM client_tickets WHERE client_account_id = $1 ORDER BY created_at DESC`,
            [accountId],
          );
        }
        return ctx.json(res, 200, { tickets: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list the client tickets.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const accountId = String(body?.accountId || "");
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const validated = validateTicketInput(body);
      if (validated.error) return ctx.json(res, 400, { error: validated.error });
      const requestKey = idempotencyKey(req);
      if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });

      const db = ctx.getPool();
      if (!(await requireAccountScope(db, { req, res, session, accountId, action: "ticket_open" }))) return;
      const requestFingerprint = fingerprint({ accountId, ...validated.value });
      const ticketId = randomUUID();
      let client;
      try {
        client = await db.connect();
        await client.query("BEGIN");
        const stillAllowed = await client.query(
          `SELECT g.id
           FROM client_access_grants g
           JOIN client_accounts a ON a.id = g.client_account_id
           WHERE g.identity_id = $1 AND g.client_account_id = $2
             AND g.revoked_at IS NULL AND a.status = 'active'
           FOR SHARE OF g, a`,
          [session.identityId, accountId],
        );
        if (!stillAllowed.rows[0]) {
          await client.query("ROLLBACK");
          if (!await auditOr503(db, res, { actorKind: "client", actorId: session.identityId, action: "ticket_open", target: accountId, result: "denied", category: "authorization_denied" })) return;
          return ctx.json(res, 403, { error: "forbidden" });
        }

        const prior = await client.query(
          `SELECT id, status, request_fingerprint
           FROM client_tickets
           WHERE opened_by_identity = $1 AND idempotency_key = $2`,
          [session.identityId, requestKey],
        );
        if (prior.rows[0]) {
          await client.query("ROLLBACK");
          if (prior.rows[0].request_fingerprint !== requestFingerprint) {
            return ctx.json(res, 409, { error: "idempotency_conflict" });
          }
          return ctx.json(res, 200, { ok: true, ticketId: prior.rows[0].id, status: prior.rows[0].status, replayed: true });
        }

        await client.query(
          `INSERT INTO client_tickets
             (id, client_account_id, opened_by_identity, category, title, details, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ticketId, accountId, session.identityId, validated.value.category, validated.value.title, validated.value.details, requestKey, requestFingerprint],
        );
        await client.query(
          `INSERT INTO client_ticket_status_audit
             (ticket_id, previous_status, next_status, changed_by, changed_by_identity)
           VALUES ($1,NULL,'open','client',$2)`,
          [ticketId, session.identityId],
        );
        await audit(client, { actorKind: "client", actorId: session.identityId, action: "ticket_open", target: ticketId, result: "allowed" });
        await client.query("COMMIT");
        return ctx.json(res, 201, { ok: true, ticketId, status: "open", replayed: false });
      } catch (error) {
        await rollback(client);
        if (error && typeof error === "object" && error.code === "23505") {
          const prior = await db.query(
            `SELECT id, status, request_fingerprint
             FROM client_tickets
             WHERE opened_by_identity = $1 AND idempotency_key = $2`,
            [session.identityId, requestKey],
          ).catch(() => ({ rows: [] }));
          if (prior.rows[0]) {
            if (prior.rows[0].request_fingerprint !== requestFingerprint) {
              return ctx.json(res, 409, { error: "idempotency_conflict" });
            }
            return ctx.json(res, 200, { ok: true, ticketId: prior.rows[0].id, status: prior.rows[0].status, replayed: true });
          }
        }
        return databaseFailure(res, error, "Could not atomically open the client ticket.");
      } finally {
        client?.release();
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleClientTicketReopen(req, res, ticketId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(ticketId)) return ctx.json(res, 400, { error: "invalid_ticket_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const reason = validateTicketReopenReason(body?.reason);
    if (reason.error) return ctx.json(res, 400, { error: reason.error });
    const db = ctx.getPool();
    let current;
    try {
      const found = await db.query("SELECT id, client_account_id, status FROM client_tickets WHERE id = $1", [ticketId]);
      current = found.rows[0];
    } catch (error) {
      return databaseFailure(res, error, "Could not load the client ticket for reopen.");
    }
    if (!current) return ctx.json(res, 404, { error: "ticket_not_found" });
    if (!(await requireAccountScope(db, { req, res, session, accountId: current.client_account_id, action: "ticket_reopen" }))) return;
    if (!["resolved", "closed"].includes(current.status)) return ctx.json(res, 409, { error: "ticket_reopen_only_resolved_or_closed" });

    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const locked = await client.query("SELECT status FROM client_tickets WHERE id = $1 FOR UPDATE", [ticketId]);
      const previousStatus = locked.rows[0]?.status;
      if (!previousStatus) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "ticket_not_found" });
      }
      if (!["resolved", "closed"].includes(previousStatus)) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "ticket_reopen_only_resolved_or_closed" });
      }
      await client.query(
        `UPDATE client_tickets
            SET status = 'open',
                reopen_count = reopen_count + 1,
                last_reopen_reason = $2,
                resolved_at = NULL,
                closed_at = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [ticketId, reason.value],
      );
      await client.query(
        `INSERT INTO client_ticket_status_audit
           (ticket_id, previous_status, next_status, changed_by, changed_by_identity, reason, is_reopen)
         VALUES ($1,$2,'open','client',$3,$4,TRUE)`,
        [ticketId, previousStatus, session.identityId, reason.value],
      );
      await audit(client, { actorKind: "client", actorId: session.identityId, action: "ticket_reopen", target: ticketId, result: "allowed" });
      await client.query("COMMIT");
      return ctx.json(res, 200, { ticketId, previousStatus, status: "open", reopened: true });
    } catch (error) {
      await rollback(client);
      return databaseFailure(res, error, "Could not reopen the client ticket.");
    } finally {
      client?.release();
    }
  }

  async function handleClientVisits(req, res, url) {
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const accountId = String(url.searchParams.get("account") || "");
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const status = url.searchParams.get("status");
      if (status && !isVisitStatus(status)) return ctx.json(res, 400, { error: "visit_status_invalid" });
      const db = ctx.getPool();
      if (!(await requireAccountScope(db, { req, res, session, accountId, action: "visit_list" }))) return;
      try {
        const values = [accountId];
        const statusSql = status ? " AND status = $2" : "";
        if (status) values.push(status);
        const result = await db.query(
          `SELECT id, client_account_id, contract_id, ticket_id, visit_type, title, details,
                  scheduled_at, status, confirmed_at, rescheduled_from, rescheduled_to,
                  reschedule_reason, responsible_name, location, created_at, updated_at
             FROM client_visits
            WHERE client_account_id = $1${statusSql}
            ORDER BY scheduled_at ASC LIMIT 100`,
          values,
        );
        await audit(db, { actorKind: "client", actorId: session.identityId, action: "visit_list", target: accountId, result: "allowed" });
        return ctx.json(res, 200, { visits: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list client visits.");
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  }

  async function handleClientVisitUpdate(req, res, visitId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(visitId)) return ctx.json(res, 400, { error: "invalid_visit_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const status = requireVisitStatus(body, res);
    if (!status) return;
    if (!["confirmed", "rescheduled"].includes(status)) return ctx.json(res, 403, { error: "client_visit_action_not_allowed" });
    const reschedule = status === "rescheduled" ? validateVisitReschedule({ rescheduledTo: body?.rescheduledTo, reason: body?.reason }) : null;
    if (reschedule?.error) return ctx.json(res, 400, { error: reschedule.error });
    const db = ctx.getPool();
    let current;
    try {
      const found = await db.query("SELECT * FROM client_visits WHERE id = $1", [visitId]);
      current = found.rows[0];
    } catch (error) {
      return databaseFailure(res, error, "Could not load the client visit.");
    }
    if (!current) return ctx.json(res, 404, { error: "visit_not_found" });
    if (!(await requireAccountScope(db, { req, res, session, accountId: current.client_account_id, action: "visit_status" }))) return;
    if (["completed", "cancelled", "no_show"].includes(current.status)) return ctx.json(res, 409, { error: "visit_final_status" });

    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM client_visits WHERE id = $1 FOR UPDATE", [visitId]);
      const previous = locked.rows[0];
      if (!previous) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "visit_not_found" });
      }
      if (["completed", "cancelled", "no_show"].includes(previous.status)) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "visit_final_status" });
      }
      if (status === "confirmed") {
        await client.query(
          "UPDATE client_visits SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1",
          [visitId],
        );
        await client.query(
          `INSERT INTO client_visit_status_audit
             (visit_id, previous_status, next_status, changed_by, changed_by_identity, reason)
           VALUES ($1,$2,'confirmed','client',$3,$4)`,
          [visitId, previous.status, session.identityId, "Confirmação pelo cliente"],
        );
      } else {
        await client.query(
          `UPDATE client_visits
              SET status = 'rescheduled', scheduled_at = $2, rescheduled_from = $3,
                  rescheduled_to = $2, reschedule_reason = $4
            WHERE id = $1`,
          [visitId, reschedule.value.rescheduledTo, previous.scheduled_at, reschedule.value.reason],
        );
        await client.query(
          `INSERT INTO client_visit_status_audit
             (visit_id, previous_status, next_status, changed_by, changed_by_identity, reason, scheduled_from, scheduled_to)
           VALUES ($1,$2,'rescheduled','client',$3,$4,$5,$6)`,
          [visitId, previous.status, session.identityId, reschedule.value.reason, previous.scheduled_at, reschedule.value.rescheduledTo],
        );
      }
      await audit(client, { actorKind: "client", actorId: session.identityId, action: "visit_status", target: visitId, result: "allowed" });
      await client.query("COMMIT");
      const updated = await db.query("SELECT * FROM client_visits WHERE id = $1", [visitId]);
      return ctx.json(res, 200, { visit: updated.rows[0] });
    } catch (error) {
      await rollback(client);
      return databaseFailure(res, error, "Could not update the client visit.");
    } finally {
      client?.release();
    }
  }

  async function handleClientReports(req, res, url) {
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const accountId = String(url.searchParams.get("account") || "");
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const db = ctx.getPool();
      if (!(await requireAccountScope(db, { req, res, session, accountId, action: "report_list" }))) return;
      try {
        const result = await db.query(
          `SELECT r.id, r.client_account_id, r.contract_id, r.visit_id, r.ticket_id, r.report_type, r.title, r.summary,
                  r.period_start, r.period_end, r.status, r.review_notes, r.reviewed_at, r.approved_at,
                  r.sent_at, r.acknowledged_at, r.acknowledgement_note, r.created_at, r.updated_at,
                  t.title AS ticket_title, t.status AS ticket_status
             FROM client_reports r
             LEFT JOIN client_tickets t ON t.id = r.ticket_id AND t.client_account_id = r.client_account_id
            WHERE r.client_account_id = $1 AND r.status IN ('approved','sent','acknowledged')
            ORDER BY COALESCE(r.period_end, r.created_at::date) DESC, r.created_at DESC LIMIT 100`,
          [accountId],
        );
        await audit(db, { actorKind: "client", actorId: session.identityId, action: "report_list", target: accountId, result: "allowed" });
        return ctx.json(res, 200, { reports: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list client reports.");
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  }

  async function handleClientReportAcknowledge(req, res, reportId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireClientSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(reportId)) return ctx.json(res, 400, { error: "invalid_report_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const note = validateReportNote(body?.note, { field: "report_acknowledgement" });
    if (note.error) return ctx.json(res, 400, { error: note.error });
    const db = ctx.getPool();
    let current;
    try {
      const found = await db.query("SELECT * FROM client_reports WHERE id = $1", [reportId]);
      current = found.rows[0];
    } catch (error) {
      return databaseFailure(res, error, "Could not load the client report.");
    }
    if (!current) return ctx.json(res, 404, { error: "report_not_found" });
    if (!(await requireAccountScope(db, { req, res, session, accountId: current.client_account_id, action: "report_acknowledge" }))) return;
    if (!['approved','sent','acknowledged'].includes(current.status)) return ctx.json(res, 403, { error: "report_not_published" });
    if (current.status === "acknowledged") return ctx.json(res, 200, { reportId, status: "acknowledged", replayed: true });

    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const locked = await client.query("SELECT status, report_type, ticket_id FROM client_reports WHERE id = $1 FOR UPDATE", [reportId]);
      const previousStatus = locked.rows[0]?.status;
      if (!previousStatus) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "report_not_found" });
      }
      if (!['approved','sent'].includes(previousStatus)) {
        await client.query("ROLLBACK");
        return previousStatus === "acknowledged"
          ? ctx.json(res, 200, { reportId, status: "acknowledged", replayed: true })
          : ctx.json(res, 403, { error: "report_not_published" });
      }
      // F03 — o aceite de um relatório de aceite encerra o chamado de origem
      // na MESMA transação. Se o chamado saiu de "resolvido" (reabertura do
      // cliente, por exemplo), o aceite é recusado em vez de encerrar algo
      // que voltou a estar em aberto.
      const linkedTicketId = locked.rows[0].report_type === "acceptance" ? locked.rows[0].ticket_id : null;
      let ticketClosure = null;
      if (linkedTicketId) {
        const ticket = await client.query("SELECT status FROM client_tickets WHERE id = $1 FOR UPDATE", [linkedTicketId]);
        const ticketStatus = ticket.rows[0]?.status;
        if (ticketStatus !== "resolved") {
          await client.query("ROLLBACK");
          return ctx.json(res, 409, { error: "ticket_not_resolved_for_acceptance", status: ticketStatus ?? null });
        }
        ticketClosure = { ticketId: linkedTicketId, previousStatus: ticketStatus, status: "closed" };
      }
      await client.query(
        `UPDATE client_reports
            SET status = 'acknowledged', acknowledged_by_identity = $2,
                acknowledged_at = NOW(), acknowledgement_note = $3
          WHERE id = $1`,
        [reportId, session.identityId, note.value],
      );
      await client.query(
        `INSERT INTO client_report_status_audit
           (report_id, previous_status, next_status, changed_by, changed_by_identity, reason)
         VALUES ($1,$2,'acknowledged','client',$3,$4)`,
        [reportId, previousStatus, session.identityId, note.value],
      );
      if (ticketClosure) {
        await client.query(
          `UPDATE client_tickets
              SET status = 'closed', closed_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [ticketClosure.ticketId],
        );
        await client.query(
          `INSERT INTO client_ticket_status_audit
             (ticket_id, previous_status, next_status, changed_by, changed_by_identity, reason)
           VALUES ($1,'resolved','closed','client',$2,$3)`,
          [ticketClosure.ticketId, session.identityId, note.value || "Aceite do relatório registrado pelo cliente"],
        );
        await audit(client, { actorKind: "client", actorId: session.identityId, action: "ticket_status", target: ticketClosure.ticketId, result: "allowed" });
      }
      await audit(client, { actorKind: "client", actorId: session.identityId, action: "report_acknowledge", target: reportId, result: "allowed" });
      await client.query("COMMIT");
      return ctx.json(res, 200, { reportId, previousStatus, status: "acknowledged", replayed: false, ticket: ticketClosure });
    } catch (error) {
      await rollback(client);
      return databaseFailure(res, error, "Could not acknowledge the client report.");
    } finally {
      client?.release();
    }
  }

  // ---------- administração (Marcelo/TI) ----------

  async function handleAdminIdentities(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const query = String(url.searchParams.get("q") || "").trim();
    if (query.length < 3) return ctx.json(res, 200, { identities: [] });
    try {
      const result = await ctx.getPool().query(
        `SELECT id, email, display_name, status, created_at
         FROM auth_identities
         WHERE kind = 'client' AND (email ILIKE $1 OR display_name ILIKE $1)
         ORDER BY created_at DESC LIMIT 10`,
        [`%${query.replace(/[%_]/g, "")}%`],
      );
      return ctx.json(res, 200, { identities: result.rows });
    } catch (error) {
      return databaseFailure(res, error, "Could not search the client identities.");
    }
  }

  async function handleAdminAccounts(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const { limit, offset } = paginate(url, res);
      const status = url.searchParams.get("status");
      if (status && !isAccountStatus(status)) return ctx.json(res, 400, { error: "invalid_status_filter" });
      try {
        const values = [];
        let where = "";
        if (status) {
          values.push(status);
          where = "WHERE status = $1";
        }
        const result = await ctx.getPool().query(
          `SELECT id, display_name, document_ref, status, notes, created_by, created_at, updated_at
           FROM client_accounts ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, limit, offset],
        );
        return ctx.json(res, 200, { accounts: result.rows, limit, offset, role: session.role });
      } catch (error) {
        return databaseFailure(res, error, "Could not list the client accounts.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const validated = validateAccountInput(body);
      if (validated.error) return ctx.json(res, 400, { error: validated.error });
      const accountId = randomUUID();
      const db = ctx.getPool();
      try {
        await transaction(db, async client => {
          await client.query(
            "INSERT INTO client_accounts (id, display_name, document_ref, notes, created_by) VALUES ($1,$2,$3,$4,$5)",
            [accountId, validated.value.displayName, validated.value.documentRef, validated.value.notes, session.role],
          );
          await audit(client, { actorKind: session.role, actorId: session.identityId, action: "account_create", target: accountId, result: "allowed" });
        });
        return ctx.json(res, 201, { accountId, status: "active" });
      } catch (error) {
        return databaseFailure(res, error, "Could not atomically create the client account.");
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleAdminAccountStatus(req, res, accountId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    if (!isAccountStatus(body?.status)) return ctx.json(res, 400, { error: "account_status_invalid" });
    const db = ctx.getPool();
    try {
      const updated = await transaction(db, async client => {
        const result = await client.query(
          "UPDATE client_accounts SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING status",
          [accountId, body.status],
        );
        if (!result.rows[0]) return null;
        await audit(client, { actorKind: session.role, actorId: session.identityId, action: "account_status", target: accountId, result: "allowed" });
        return result.rows[0];
      });
      if (!updated) return ctx.json(res, 404, { error: "account_not_found" });
      return ctx.json(res, 200, { accountId, status: updated.status });
    } catch (error) {
      return databaseFailure(res, error, "Could not atomically update the client account status.");
    }
  }

  async function handleAdminGrants(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const identityId = url.searchParams.get("identity");
      const accountId = url.searchParams.get("account");
      if (identityId && !UUID_PATTERN.test(identityId)) return ctx.json(res, 400, { error: "invalid_identity_id" });
      if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      try {
        const conditions = [];
        const values = [];
        if (identityId) {
          values.push(identityId);
          conditions.push(`g.identity_id = $${values.length}`);
        }
        if (accountId) {
          values.push(accountId);
          conditions.push(`g.client_account_id = $${values.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await ctx.getPool().query(
          `SELECT g.id, g.identity_id, i.email AS identity_email, i.display_name AS identity_name,
                  g.client_account_id, a.display_name AS account_name, g.scope_note, g.reason,
                  g.granted_by, g.created_at, g.revoked_at, g.revoked_by, g.revoke_reason
           FROM client_access_grants g
           JOIN auth_identities i ON i.id = g.identity_id
           JOIN client_accounts a ON a.id = g.client_account_id
           ${where}
           ORDER BY g.created_at DESC LIMIT 200`,
          values,
        );
        return ctx.json(res, 200, { grants: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list the client access grants.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const identityId = String(body?.identityId || "");
      const accountId = String(body?.clientAccountId || "");
      if (!UUID_PATTERN.test(identityId)) return ctx.json(res, 400, { error: "invalid_identity_id" });
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const reason = validateReason(body?.reason);
      if (reason.error) return ctx.json(res, 400, { error: reason.error });
      const scopeNote = validateScopeNote(body?.scopeNote);
      if (scopeNote.error) return ctx.json(res, 400, { error: scopeNote.error });
      const db = ctx.getPool();
      const grantId = randomUUID();
      try {
        const outcome = await transaction(db, async client => {
          const identity = await client.query(
            "SELECT id, status FROM auth_identities WHERE kind = 'client' AND id = $1 FOR SHARE",
            [identityId],
          );
          if (!identity.rows[0]) return "identity_not_found";
          if (identity.rows[0].status === "disabled") {
            await audit(client, { actorKind: session.role, actorId: session.identityId, action: "grant_issue", target: identityId, result: "denied", category: "authorization_denied" });
            return "identity_disabled";
          }
          const account = await client.query("SELECT id FROM client_accounts WHERE id = $1 FOR SHARE", [accountId]);
          if (!account.rows[0]) return "account_not_found";
          await client.query(
            `INSERT INTO client_access_grants (id, identity_id, client_account_id, scope_note, reason, granted_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [grantId, identityId, accountId, scopeNote.value, reason.value, session.role],
          );
          await audit(client, { actorKind: session.role, actorId: session.identityId, action: "grant_issue", target: grantId, result: "allowed" });
          return "created";
        });
        if (outcome === "identity_not_found") return ctx.json(res, 404, { error: outcome });
        if (outcome === "account_not_found") return ctx.json(res, 404, { error: outcome });
        if (outcome === "identity_disabled") return ctx.json(res, 409, { error: outcome });
        return ctx.json(res, 201, { grantId });
      } catch (error) {
        if (error && typeof error === "object" && error.code === "23505") {
          return ctx.json(res, 409, { error: "grant_exists" });
        }
        return databaseFailure(res, error, "Could not atomically create the client access grant.");
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleAdminGrantRevoke(req, res, grantId) {
    if (!requireMethod(req, res, ["DELETE", "POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(grantId)) return ctx.json(res, 400, { error: "invalid_grant_id" });
    let body = {};
    try {
      body = await ctx.readJson(req);
    } catch {
      return ctx.json(res, 400, { error: "invalid_request" });
    }
    const reason = validateReason(body?.reason);
    if (reason.error) return ctx.json(res, 400, { error: reason.error });
    const db = ctx.getPool();
    try {
      const outcome = await transaction(db, async client => {
        const updated = await client.query(
          `UPDATE client_access_grants SET revoked_at = NOW(), revoked_by = $2, revoke_reason = $3
           WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
          [grantId, session.role, reason.value],
        );
        if (!updated.rows[0]) {
          const existing = await client.query("SELECT revoked_at FROM client_access_grants WHERE id = $1", [grantId]);
          return existing.rows[0] ? "already_revoked" : "not_found";
        }
        await audit(client, { actorKind: session.role, actorId: session.identityId, action: "grant_revoke", target: grantId, result: "allowed" });
        return "revoked";
      });
      if (outcome === "not_found") return ctx.json(res, 404, { error: "grant_not_found" });
      return ctx.json(res, 200, { ok: true, outcome });
    } catch (error) {
      return databaseFailure(res, error, "Could not atomically revoke the client access grant.");
    }
  }

  async function handleAdminContracts(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const accountId = url.searchParams.get("account");
      if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      try {
        const values = [];
        let where = "";
        if (accountId) {
          values.push(accountId);
          where = "WHERE c.client_account_id = $1";
        }
        const result = await ctx.getPool().query(
          `SELECT c.*, a.display_name AS account_name
           FROM client_contracts c JOIN client_accounts a ON a.id = c.client_account_id
           ${where} ORDER BY c.created_at DESC LIMIT 200`,
          values,
        );
        return ctx.json(res, 200, { contracts: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list the client contracts.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const accountId = String(body?.accountId || "");
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const validated = validateContractInput(body);
      if (validated.error) return ctx.json(res, 400, { error: validated.error });
      if (!isValidServiceName(validated.value.service)) return ctx.json(res, 400, { error: "contract_service_unknown" });
      const db = ctx.getPool();
      const contractId = randomUUID();
      try {
        const created = await transaction(db, async client => {
          const account = await client.query("SELECT id FROM client_accounts WHERE id = $1 FOR SHARE", [accountId]);
          if (!account.rows[0]) return false;
          await client.query(
            `INSERT INTO client_contracts (id, client_account_id, title, service, status, starts_on, ends_on, summary, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [contractId, accountId, validated.value.title, validated.value.service, validated.value.status, validated.value.startsOn, validated.value.endsOn, validated.value.summary, session.role],
          );
          await audit(client, { actorKind: session.role, actorId: session.identityId, action: "contract_create", target: contractId, result: "allowed" });
          return true;
        });
        if (!created) return ctx.json(res, 404, { error: "account_not_found" });
        return ctx.json(res, 201, { contractId });
      } catch (error) {
        return databaseFailure(res, error, "Could not atomically create the client contract.");
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleAdminContractStatus(req, res, contractId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(contractId)) return ctx.json(res, 400, { error: "invalid_contract_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    if (!isContractStatus(body?.status)) return ctx.json(res, 400, { error: "contract_status_invalid" });
    const db = ctx.getPool();
    try {
      const updated = await transaction(db, async client => {
        const result = await client.query(
          "UPDATE client_contracts SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING status",
          [contractId, body.status],
        );
        if (!result.rows[0]) return null;
        await audit(client, { actorKind: session.role, actorId: session.identityId, action: "contract_status", target: contractId, result: "allowed" });
        return result.rows[0];
      });
      if (!updated) return ctx.json(res, 404, { error: "contract_not_found" });
      return ctx.json(res, 200, { contractId, status: updated.status });
    } catch (error) {
      return databaseFailure(res, error, "Could not atomically update the contract status.");
    }
  }

  async function handleAdminDocuments(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      const accountId = url.searchParams.get("account");
      if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      try {
        const values = [];
        let where = "";
        if (accountId) {
          values.push(accountId);
          where = "WHERE d.client_account_id = $1";
        }
        const result = await ctx.getPool().query(
          `SELECT d.id, d.client_account_id, a.display_name AS account_name, d.title, d.category,
                  d.original_filename, d.content_type, d.size_bytes, d.uploaded_by, d.created_at
           FROM client_documents d JOIN client_accounts a ON a.id = d.client_account_id
           ${where} ORDER BY d.created_at DESC LIMIT 200`,
          values,
        );
        return ctx.json(res, 200, { documents: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list the client documents.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res, UPLOAD_BODY_LIMIT);
      if (body === undefined) return;
      const accountId = String(body?.accountId || "");
      if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const meta = validateDocumentMeta(body);
      if (meta.error) return ctx.json(res, 400, { error: meta.error });
      const base64 = typeof body?.contentBase64 === "string" ? body.contentBase64.replace(/\s+/g, "") : "";
      if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length % 4 !== 0) {
        return ctx.json(res, 400, { error: "document_content_invalid" });
      }
      const content = Buffer.from(base64, "base64");
      if (!content.length) return ctx.json(res, 400, { error: "document_empty" });
      if (content.length > MAX_DOCUMENT_BYTES) return ctx.json(res, 413, { error: "document_too_large" });
      const requestKey = idempotencyKey(req);
      if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });
      const contentSha256 = createHash("sha256").update(content).digest("hex");
      const requestFingerprint = fingerprint({ accountId, ...meta.value, contentSha256 });
      const db = ctx.getPool();
      const documentId = randomUUID();
      let client;
      let storedPath = null;
      try {
        client = await db.connect();
        await client.query("BEGIN");
        const account = await client.query("SELECT id FROM client_accounts WHERE id = $1 FOR SHARE", [accountId]);
        if (!account.rows[0]) {
          await client.query("ROLLBACK");
          return ctx.json(res, 404, { error: "account_not_found" });
        }

        const prior = await client.query(
          `SELECT id, size_bytes, content_type, content_sha256, request_fingerprint
           FROM client_documents
           WHERE uploaded_by_identity = $1 AND idempotency_key = $2`,
          [session.identityId, requestKey],
        );
        if (prior.rows[0]) {
          await client.query("ROLLBACK");
          if (prior.rows[0].request_fingerprint !== requestFingerprint) {
            return ctx.json(res, 409, { error: "idempotency_conflict" });
          }
          return ctx.json(res, 200, {
            ok: true,
            documentId: prior.rows[0].id,
            sizeBytes: Number(prior.rows[0].size_bytes),
            contentType: prior.rows[0].content_type,
            contentSha256: prior.rows[0].content_sha256,
            replayed: true,
          });
        }

        await mkdir(ctx.docsDir, { recursive: true });
        const storageKey = randomBytes(24).toString("hex");
        storedPath = path.join(ctx.docsDir, storageKey);
        // A chave é gerada pelo servidor e nunca deriva do nome enviado. Se
        // insert/auditoria/commit falhar, o catch remove este arquivo.
        await writeFile(storedPath, content, { flag: "wx" });
        await client.query(
          `INSERT INTO client_documents
             (id, client_account_id, title, category, original_filename, content_type, size_bytes,
              storage_key, uploaded_by, uploaded_by_identity, content_sha256, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [documentId, accountId, meta.value.title, meta.value.category, meta.value.originalFilename,
           meta.value.contentType, content.length, storageKey, session.role, session.identityId,
           contentSha256, requestKey, requestFingerprint],
        );
        await audit(client, { actorKind: session.role, actorId: session.identityId, action: "document_upload", target: documentId, result: "allowed" });
        await client.query("COMMIT");
        storedPath = null;
        return ctx.json(res, 201, {
          ok: true,
          documentId,
          sizeBytes: content.length,
          contentType: meta.value.contentType,
          contentSha256,
          replayed: false,
        });
      } catch (error) {
        await rollback(client);
        if (storedPath) await unlink(storedPath).catch(() => {});
        if (error && typeof error === "object" && error.code === "23505") {
          const prior = await db.query(
            `SELECT id, size_bytes, content_type, content_sha256, request_fingerprint
             FROM client_documents
             WHERE uploaded_by_identity = $1 AND idempotency_key = $2`,
            [session.identityId, requestKey],
          ).catch(() => ({ rows: [] }));
          if (prior.rows[0]) {
            if (prior.rows[0].request_fingerprint !== requestFingerprint) {
              return ctx.json(res, 409, { error: "idempotency_conflict" });
            }
            return ctx.json(res, 200, {
              ok: true,
              documentId: prior.rows[0].id,
              sizeBytes: Number(prior.rows[0].size_bytes),
              contentType: prior.rows[0].content_type,
              contentSha256: prior.rows[0].content_sha256,
              replayed: true,
            });
          }
        }
        return databaseFailure(res, error, "Could not atomically store the client document.");
      } finally {
        client?.release();
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleAdminDocumentDownload(req, res, documentId) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(documentId)) return ctx.json(res, 400, { error: "invalid_document_id" });
    const db = ctx.getPool();
    let document;
    try {
      const found = await db.query("SELECT * FROM client_documents WHERE id = $1", [documentId]);
      document = found.rows[0];
    } catch (error) {
      return databaseFailure(res, error, "Could not load the client document.");
    }
    if (!document) return ctx.json(res, 404, { error: "document_not_found" });
    return streamDocument({ req, res, document, auditContext: { actorKind: session.role, actorId: session.identityId } });
  }

  async function handleAdminTickets(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (req.method !== "GET") return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    const status = url.searchParams.get("status");
    if (status && !isTicketStatus(status)) return ctx.json(res, 400, { error: "invalid_status_filter" });
    const accountId = url.searchParams.get("account");
    if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    try {
      const conditions = [];
      const values = [];
      if (status) {
        values.push(status);
        conditions.push(`t.status = $${values.length}`);
      }
      if (accountId) {
        values.push(accountId);
        conditions.push(`t.client_account_id = $${values.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      let result;
      try {
        result = await ctx.getPool().query(
          `SELECT t.id, t.client_account_id, a.display_name AS account_name, i.email AS opened_by_email,
                  t.category, t.title, t.details, t.status, t.admin_response, t.created_at, t.updated_at,
                  t.sla_due_at, t.sla_paused_at, t.sla_pause_reason, t.sla_total_paused_seconds,
                  t.reopen_count, t.last_reopen_reason, t.resolved_at, t.closed_at
           FROM client_tickets t
           JOIN client_accounts a ON a.id = t.client_account_id
           JOIN auth_identities i ON i.id = t.opened_by_identity
           ${where} ORDER BY t.created_at DESC LIMIT 200`,
          values,
        );
      } catch (error) {
        if (!error || typeof error !== "object" || error.code !== "42703") throw error;
        result = await ctx.getPool().query(
          `SELECT t.id, t.client_account_id, a.display_name AS account_name, i.email AS opened_by_email,
                  t.category, t.title, t.details, t.status, t.admin_response, t.created_at, t.updated_at,
                  NULL::timestamptz AS sla_due_at, NULL::timestamptz AS sla_paused_at,
                  NULL::text AS sla_pause_reason, 0::bigint AS sla_total_paused_seconds,
                  0::int AS reopen_count, NULL::text AS last_reopen_reason,
                  NULL::timestamptz AS resolved_at, NULL::timestamptz AS closed_at
           FROM client_tickets t
           JOIN client_accounts a ON a.id = t.client_account_id
           JOIN auth_identities i ON i.id = t.opened_by_identity
           ${where} ORDER BY t.created_at DESC LIMIT 200`,
          values,
        );
      }
      return ctx.json(res, 200, { tickets: result.rows });
    } catch (error) {
      return databaseFailure(res, error, "Could not list the client tickets.");
    }
  }

  async function handleAdminTicketUpdate(req, res, ticketId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(ticketId)) return ctx.json(res, 400, { error: "invalid_ticket_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    if (!isTicketStatus(body?.status)) return ctx.json(res, 400, { error: "ticket_status_invalid" });
    const responseText = typeof body?.adminResponse === "string" ? body.adminResponse.trim() : "";
    if (responseText.length > TEXT_LIMITS.ticketResponse) return ctx.json(res, 400, { error: "ticket_response_too_long" });
    const status = String(body.status);
    const reasonText = typeof body?.reason === "string" ? body.reason.trim() : "";
    const reopenReason = validateTicketReopenReason(body?.reopenReason || body?.reason);
    const db = ctx.getPool();
    let schemaTier;
    try {
      schemaTier = await ticketServiceSchemaTier(db);
    } catch (error) {
      return databaseFailure(res, error, "Could not verify the client ticket lifecycle schema.");
    }
    if (schemaTier === "incomplete") return ctx.json(res, 503, { error: "migration_required" });
    if (schemaTier === "canonical") {
      return serviceTicketTransition(req, res, {
        db, session, ticketId, status, body, reasonText, responseText,
      });
    }
    if (schemaTier === "legacy") {
      if (!LEGACY_TICKET_STATUSES.has(status)) return ctx.json(res, 503, { error: "migration_required" });
      let legacyClient;
      try {
        legacyClient = await db.connect();
        await legacyClient.query("BEGIN");
        const current = await legacyClient.query("SELECT status FROM client_tickets WHERE id = $1 FOR UPDATE", [ticketId]);
        if (!current.rows[0]) {
          await legacyClient.query("ROLLBACK");
          return ctx.json(res, 404, { error: "ticket_not_found" });
        }
        const previousStatus = current.rows[0].status;
        await legacyClient.query(
          "UPDATE client_tickets SET status = $2, admin_response = COALESCE(NULLIF($3, ''), admin_response), updated_at = NOW() WHERE id = $1",
          [ticketId, status, responseText],
        );
        if (previousStatus !== status) {
          await legacyClient.query(
            `INSERT INTO client_ticket_status_audit
               (ticket_id, previous_status, next_status, changed_by, changed_by_identity)
             VALUES ($1,$2,$3,$4,$5)`,
            [ticketId, previousStatus, status, roleActor(session), session.identityId],
          );
        }
        await audit(legacyClient, { actorKind: roleActor(session), actorId: session.identityId, action: "ticket_status", target: ticketId, result: "allowed" });
        await legacyClient.query("COMMIT");
        return ctx.json(res, 200, { ticketId, previousStatus, status, isReopen: false });
      } catch (error) {
        await rollback(legacyClient);
        return databaseFailure(res, error, "Could not update the legacy client ticket.");
      } finally {
        legacyClient?.release();
      }
    }
    return ctx.json(res, 503, { error: "migration_required" });
  }

  // F03 — atendimento canônico do chamado pela equipe.
  // Deny-by-default já foi aplicado pelo chamador (sessão individual marcelo/ti
  // e mesma origem). Aqui cada comando precisa de chave de idempotência, só
  // pode seguir a máquina de estados declarada e sempre devolve uma mensagem
  // ao cliente. "closed" nunca é aceito: encerrar é ato do cliente no aceite.
  async function serviceTicketTransition(req, res, { db, session, ticketId, status, body, reasonText, responseText }) {
    const requestKey = idempotencyKey(req);
    if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });
    const note = validateTicketServiceNote(responseText || body?.serviceNote);
    if (note.error) return ctx.json(res, 400, { error: note.error });
    if (status === "closed") return ctx.json(res, 409, { error: "ticket_close_requires_client_acceptance" });
    const reopenReason = validateTicketReopenReason(body?.reopenReason || body?.reason || note.value);
    const requestFingerprint = fingerprint({ ticketId, status, note: note.value, reason: reasonText || null });

    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const current = await client.query("SELECT status FROM client_tickets WHERE id = $1 FOR UPDATE", [ticketId]);
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "ticket_not_found" });
      }
      const previousStatus = current.rows[0].status;

      // O replay é resolvido depois do lock: retries concorrentes do mesmo
      // comando convergem para uma única transição materializada.
      const replay = await client.query(
        `SELECT previous_status, next_status, is_reopen, request_fingerprint
           FROM client_ticket_status_audit
          WHERE ticket_id = $1 AND idempotency_key = $2`,
        [ticketId, requestKey],
      );
      if (replay.rows[0]) {
        await client.query("ROLLBACK");
        if (replay.rows[0].request_fingerprint !== requestFingerprint) {
          return ctx.json(res, 409, { error: "idempotency_conflict" });
        }
        return ctx.json(res, 200, {
          ticketId,
          previousStatus: replay.rows[0].previous_status,
          status: replay.rows[0].next_status,
          isReopen: replay.rows[0].is_reopen === true,
          replayed: true,
        });
      }

      if (!isTicketServiceTransitionAllowed(previousStatus, status)) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "ticket_transition_not_allowed", previousStatus, status });
      }
      const isReopen = isTicketServiceReopen(previousStatus, status);
      if (isReopen && reopenReason.error) {
        await client.query("ROLLBACK");
        return ctx.json(res, 400, { error: reopenReason.error });
      }
      let slaPauseId = null;
      if (status === "waiting_client" && previousStatus !== "waiting_client") {
        slaPauseId = await pauseTicketSla(client, {
          ticketId,
          actorKind: roleActor(session),
          actorId: session.identityId,
          reason: "waiting_client",
          notes: reasonText || note.value,
        });
      }
      if (previousStatus === "waiting_client" && status !== "waiting_client") {
        slaPauseId = await resumeTicketSla(client, {
          ticketId,
          actorKind: roleActor(session),
          actorId: session.identityId,
        });
      }
      await client.query(
        `UPDATE client_tickets
            SET status = $2,
                admin_response = $3,
                reopen_count = CASE WHEN $4 THEN reopen_count + 1 ELSE reopen_count END,
                last_reopen_reason = CASE WHEN $4 THEN $5 ELSE last_reopen_reason END,
                resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END,
                closed_at = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [ticketId, status, note.value, isReopen, isReopen ? reopenReason.value : null],
      );
      await client.query(
        `INSERT INTO client_ticket_status_audit
           (ticket_id, previous_status, next_status, changed_by, changed_by_identity, reason, is_reopen, sla_pause_id,
            idempotency_key, request_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ticketId, previousStatus, status, roleActor(session), session.identityId,
          isReopen ? reopenReason.value : (reasonText || note.value), isReopen, slaPauseId,
          requestKey, requestFingerprint],
      );
      await audit(client, { actorKind: roleActor(session), actorId: session.identityId, action: isReopen ? "ticket_reopen" : "ticket_status", target: ticketId, result: "allowed" });
      await client.query("COMMIT");
      return ctx.json(res, 200, { ticketId, previousStatus, status, isReopen, replayed: false });
    } catch (error) {
      await rollback(client);
      if (error && typeof error === "object" && error.code === "23505") {
        const prior = await db.query(
          `SELECT previous_status, next_status, is_reopen, request_fingerprint
             FROM client_ticket_status_audit WHERE ticket_id = $1 AND idempotency_key = $2`,
          [ticketId, requestKey],
        ).catch(() => ({ rows: [] }));
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
          return ctx.json(res, 200, {
            ticketId,
            previousStatus: prior.rows[0].previous_status,
            status: prior.rows[0].next_status,
            isReopen: prior.rows[0].is_reopen === true,
            replayed: true,
          });
        }
      }
      return databaseFailure(res, error, "Could not update the client ticket.");
    } finally {
      client?.release();
    }
  }

  async function handleAdminVisits(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      if (status && !isVisitStatus(status)) return ctx.json(res, 400, { error: "visit_status_invalid" });
      const accountId = url.searchParams.get("account");
      if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const values = [];
      const conditions = [];
      if (status) { values.push(status); conditions.push(`v.status = $${values.length}`); }
      if (accountId) { values.push(accountId); conditions.push(`v.client_account_id = $${values.length}`); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      try {
        const result = await db.query(
          `SELECT v.*, a.display_name AS account_name, c.title AS contract_title, t.title AS ticket_title
             FROM client_visits v
             JOIN client_accounts a ON a.id = v.client_account_id
             LEFT JOIN client_contracts c ON c.id = v.contract_id
             LEFT JOIN client_tickets t ON t.id = v.ticket_id
             ${where}
            ORDER BY v.scheduled_at DESC LIMIT 200`,
          values,
        );
        return ctx.json(res, 200, { visits: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list client visits for admin.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const input = validateVisitInput({
        accountId: body?.accountId,
        contractId: body?.contractId,
        ticketId: body?.ticketId,
        visitType: body?.visitType,
        title: body?.title,
        details: body?.details,
        scheduledAt: body?.scheduledAt,
        responsibleName: body?.responsibleName,
        location: body?.location,
      });
      if (input.error) return ctx.json(res, 400, { error: input.error });
      if (!UUID_PATTERN.test(input.value.accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const contract = optionalUuid(input.value.contractId); if (contract.error) return ctx.json(res, 400, { error: "invalid_contract_id" });
      const ticket = optionalUuid(input.value.ticketId); if (ticket.error) return ctx.json(res, 400, { error: "invalid_ticket_id" });
      if (!(await ensureAccountExists(db, res, input.value.accountId))) return;
      if (!(await validateClientRefs(db, res, { accountId: input.value.accountId, contractId: contract.value, ticketId: ticket.value }))) return;
      let client;
      try {
        client = await db.connect();
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO client_visits
             (client_account_id, contract_id, ticket_id, visit_type, title, details, scheduled_at,
              responsible_name, location, created_by, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *`,
          [input.value.accountId, contract.value, ticket.value, input.value.visitType, input.value.title,
           input.value.details, input.value.scheduledAt, input.value.responsibleName, input.value.location,
           roleActor(session), session.identityId],
        );
        await client.query(
          `INSERT INTO client_visit_status_audit
             (visit_id, previous_status, next_status, changed_by, changed_by_identity, reason, scheduled_to)
           VALUES ($1,NULL,'scheduled',$2,$3,$4,$5)`,
          [inserted.rows[0].id, roleActor(session), session.identityId, "Agendamento inicial", input.value.scheduledAt],
        );
        await audit(client, { actorKind: roleActor(session), actorId: session.identityId, action: "visit_create", target: inserted.rows[0].id, result: "allowed" });
        await client.query("COMMIT");
        return ctx.json(res, 201, { visit: inserted.rows[0] });
      } catch (error) {
        await rollback(client);
        return databaseFailure(res, error, "Could not create the client visit.");
      } finally {
        client?.release();
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleAdminVisitUpdate(req, res, visitId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(visitId)) return ctx.json(res, 400, { error: "invalid_visit_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const status = requireVisitStatus(body, res);
    if (!status) return;
    const reschedule = status === "rescheduled" ? validateVisitReschedule({ rescheduledTo: body?.rescheduledTo, reason: body?.reason }) : null;
    if (reschedule?.error) return ctx.json(res, 400, { error: reschedule.error });
    const reasonText = typeof body?.reason === "string" ? body.reason.trim() : "";
    let client;
    try {
      client = await ctx.getPool().connect();
      await client.query("BEGIN");
      const current = await client.query("SELECT * FROM client_visits WHERE id = $1 FOR UPDATE", [visitId]);
      const previous = current.rows[0];
      if (!previous) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "visit_not_found" });
      }
      if (status === "rescheduled") {
        await client.query(
          `UPDATE client_visits
              SET status = 'rescheduled', scheduled_at = $2, rescheduled_from = $3,
                  rescheduled_to = $2, reschedule_reason = $4,
                  responsible_name = COALESCE(NULLIF($5,''), responsible_name),
                  location = COALESCE(NULLIF($6,''), location)
            WHERE id = $1`,
          [visitId, reschedule.value.rescheduledTo, previous.scheduled_at, reschedule.value.reason,
           String(body?.responsibleName || "").trim(), String(body?.location || "").trim()],
        );
        await client.query(
          `INSERT INTO client_visit_status_audit
             (visit_id, previous_status, next_status, changed_by, changed_by_identity, reason, scheduled_from, scheduled_to)
           VALUES ($1,$2,'rescheduled',$3,$4,$5,$6,$7)`,
          [visitId, previous.status, roleActor(session), session.identityId, reschedule.value.reason, previous.scheduled_at, reschedule.value.rescheduledTo],
        );
      } else {
        await client.query(
          `UPDATE client_visits
              SET status = $2,
                  confirmed_at = CASE WHEN $2 = 'confirmed' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
                  responsible_name = COALESCE(NULLIF($3,''), responsible_name),
                  location = COALESCE(NULLIF($4,''), location)
            WHERE id = $1`,
          [visitId, status, String(body?.responsibleName || "").trim(), String(body?.location || "").trim()],
        );
        if (previous.status !== status) {
          await client.query(
            `INSERT INTO client_visit_status_audit
               (visit_id, previous_status, next_status, changed_by, changed_by_identity, reason)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [visitId, previous.status, status, roleActor(session), session.identityId, reasonText || null],
          );
        }
      }
      await audit(client, { actorKind: roleActor(session), actorId: session.identityId, action: "visit_status", target: visitId, result: "allowed" });
      await client.query("COMMIT");
      const updated = await ctx.getPool().query("SELECT * FROM client_visits WHERE id = $1", [visitId]);
      return ctx.json(res, 200, { visit: updated.rows[0] });
    } catch (error) {
      await rollback(client);
      return databaseFailure(res, error, "Could not update the client visit.");
    } finally {
      client?.release();
    }
  }

  async function handleAdminReports(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      if (status && !isReportStatus(status)) return ctx.json(res, 400, { error: "report_status_invalid" });
      const accountId = url.searchParams.get("account");
      if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const values = [];
      const conditions = [];
      if (status) { values.push(status); conditions.push(`r.status = $${values.length}`); }
      if (accountId) { values.push(accountId); conditions.push(`r.client_account_id = $${values.length}`); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      try {
        const result = await db.query(
          `SELECT r.*, a.display_name AS account_name, c.title AS contract_title, v.title AS visit_title,
                  t.title AS ticket_title, t.status AS ticket_status
             FROM client_reports r
             JOIN client_accounts a ON a.id = r.client_account_id
             LEFT JOIN client_contracts c ON c.id = r.contract_id
             LEFT JOIN client_visits v ON v.id = r.visit_id
             LEFT JOIN client_tickets t ON t.id = r.ticket_id
             ${where}
            ORDER BY r.created_at DESC LIMIT 200`,
          values,
        );
        return ctx.json(res, 200, { reports: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list client reports for admin.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const input = validateReportInput({
        accountId: body?.accountId,
        contractId: body?.contractId,
        visitId: body?.visitId,
        ticketId: body?.ticketId,
        reportType: body?.reportType,
        title: body?.title,
        summary: body?.summary,
        periodStart: body?.periodStart,
        periodEnd: body?.periodEnd,
      });
      if (input.error) return ctx.json(res, 400, { error: input.error });
      if (!UUID_PATTERN.test(input.value.accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
      const contract = optionalUuid(input.value.contractId); if (contract.error) return ctx.json(res, 400, { error: "invalid_contract_id" });
      const visit = optionalUuid(input.value.visitId); if (visit.error) return ctx.json(res, 400, { error: "invalid_visit_id" });
      const ticket = optionalUuid(input.value.ticketId); if (ticket.error) return ctx.json(res, 400, { error: "invalid_ticket_id" });
      // F03: o relatório de aceite existe para encerrar um chamado atendido.
      if (ticket.value && input.value.reportType !== "acceptance") return ctx.json(res, 400, { error: "ticket_requires_acceptance_report" });
      const requestKey = idempotencyKey(req);
      if (ticket.value && !requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });
      if (!(await ensureAccountExists(db, res, input.value.accountId))) return;
      if (!(await validateClientRefs(db, res, { accountId: input.value.accountId, contractId: contract.value, visitId: visit.value, ticketId: ticket.value }))) return;
      const requestFingerprint = requestKey ? fingerprint({ ...input.value, ticketId: ticket.value }) : null;
      let client;
      try {
        client = await db.connect();
        await client.query("BEGIN");
        if (requestKey) {
          const prior = await client.query(
            "SELECT * FROM client_reports WHERE created_by_identity = $1 AND idempotency_key = $2",
            [session.identityId, requestKey],
          );
          if (prior.rows[0]) {
            await client.query("ROLLBACK");
            if (prior.rows[0].request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
            return ctx.json(res, 200, { report: prior.rows[0], replayed: true });
          }
        }
        if (ticket.value) {
          // O aceite só pode ser publicado sobre um chamado efetivamente
          // atendido; nada de pular o atendimento para "encerrar" o chamado.
          const ticketRow = await client.query("SELECT status FROM client_tickets WHERE id = $1 FOR UPDATE", [ticket.value]);
          if (ticketRow.rows[0]?.status !== "resolved") {
            await client.query("ROLLBACK");
            return ctx.json(res, 409, { error: "ticket_not_resolved_for_acceptance", status: ticketRow.rows[0]?.status ?? null });
          }
        }
        const inserted = await client.query(
          `INSERT INTO client_reports
             (client_account_id, contract_id, visit_id, ticket_id, report_type, title, summary, period_start, period_end,
              created_by, created_by_identity, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING *`,
          [input.value.accountId, contract.value, visit.value, ticket.value, input.value.reportType, input.value.title,
           input.value.summary, input.value.periodStart, input.value.periodEnd, roleActor(session), session.identityId,
           requestKey, requestFingerprint],
        );
        await client.query(
          `INSERT INTO client_report_status_audit
             (report_id, previous_status, next_status, changed_by, changed_by_identity, reason)
           VALUES ($1,NULL,'draft',$2,$3,$4)`,
          [inserted.rows[0].id, roleActor(session), session.identityId, "Criação inicial"],
        );
        await audit(client, { actorKind: roleActor(session), actorId: session.identityId, action: "report_create", target: inserted.rows[0].id, result: "allowed" });
        await client.query("COMMIT");
        return ctx.json(res, 201, { report: inserted.rows[0] });
      } catch (error) {
        await rollback(client);
        if (error && typeof error === "object" && error.code === "23505") {
          if (requestKey) {
            const prior = await db.query(
              "SELECT * FROM client_reports WHERE created_by_identity = $1 AND idempotency_key = $2",
              [session.identityId, requestKey],
            ).catch(() => ({ rows: [] }));
            if (prior.rows[0]) {
              if (prior.rows[0].request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
              return ctx.json(res, 200, { report: prior.rows[0], replayed: true });
            }
          }
          if (ticket.value) return ctx.json(res, 409, { error: "ticket_acceptance_already_pending" });
        }
        return databaseFailure(res, error, "Could not create the client report.");
      } finally {
        client?.release();
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleAdminReportUpdate(req, res, reportId) {
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(reportId)) return ctx.json(res, 400, { error: "invalid_report_id" });
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const status = requireReportStatus(body, res);
    if (!status) return;
    if (status === "acknowledged") return ctx.json(res, 400, { error: "client_acknowledgement_required" });
    const reviewNote = validateReportNote(body?.reviewNotes, { required: status === "in_review" || status === "rejected", field: "report_review" });
    if (reviewNote.error) return ctx.json(res, 400, { error: reviewNote.error });
    const reasonText = typeof body?.reason === "string" ? body.reason.trim() : "";
    let client;
    try {
      client = await ctx.getPool().connect();
      await client.query("BEGIN");
      const current = await client.query("SELECT * FROM client_reports WHERE id = $1 FOR UPDATE", [reportId]);
      const previous = current.rows[0];
      if (!previous) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "report_not_found" });
      }
      if (status === "approved" && !previous.reviewed_at) {
        await client.query("ROLLBACK");
        return ctx.json(res, 400, { error: "report_review_required" });
      }
      if (status === "sent" && previous.status !== "approved" && previous.status !== "sent") {
        await client.query("ROLLBACK");
        return ctx.json(res, 400, { error: "report_approval_required" });
      }
      await client.query(
        `UPDATE client_reports
            SET status = $2,
                review_notes = COALESCE($3, review_notes),
                reviewed_by_identity = CASE WHEN $2 IN ('in_review','rejected') THEN $4 ELSE reviewed_by_identity END,
                reviewed_at = CASE WHEN $2 IN ('in_review','rejected') THEN NOW() ELSE reviewed_at END,
                approved_by_identity = CASE WHEN $2 = 'approved' THEN $4 ELSE approved_by_identity END,
                approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END,
                sent_at = CASE WHEN $2 = 'sent' THEN COALESCE(sent_at, NOW()) ELSE sent_at END
          WHERE id = $1`,
        [reportId, status, reviewNote.value, session.identityId],
      );
      if (previous.status !== status) {
        await client.query(
          `INSERT INTO client_report_status_audit
             (report_id, previous_status, next_status, changed_by, changed_by_identity, reason)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [reportId, previous.status, status, roleActor(session), session.identityId, reviewNote.value || reasonText || null],
        );
      }
      await audit(client, { actorKind: roleActor(session), actorId: session.identityId, action: "report_status", target: reportId, result: "allowed" });
      await client.query("COMMIT");
      const updated = await ctx.getPool().query("SELECT * FROM client_reports WHERE id = $1", [reportId]);
      return ctx.json(res, 200, { report: updated.rows[0] });
    } catch (error) {
      await rollback(client);
      return databaseFailure(res, error, "Could not update the client report.");
    } finally {
      client?.release();
    }
  }

  return {
    handleClientAccounts,
    handleClientContracts,
    handleClientDocuments,
    handleClientDocumentDownload,
    handleClientTickets,
    handleClientTicketReopen,
    handleClientVisits,
    handleClientVisitUpdate,
    handleClientReports,
    handleClientReportAcknowledge,
    handleAdminIdentities,
    handleAdminAccounts,
    handleAdminAccountStatus,
    handleAdminGrants,
    handleAdminGrantRevoke,
    handleAdminContracts,
    handleAdminContractStatus,
    handleAdminDocuments,
    handleAdminDocumentDownload,
    handleAdminTickets,
    handleAdminTicketUpdate,
    handleAdminVisits,
    handleAdminVisitUpdate,
    handleAdminReports,
    handleAdminReportUpdate,
  };
}
