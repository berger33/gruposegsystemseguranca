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
  isTicketStatus,
  validateAccountInput,
  validateContractInput,
  validateDocumentMeta,
  validateReason,
  validateScopeNote,
  validateTicketInput,
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
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
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
        const result = await db.query(
          `SELECT id, category, title, details, status, admin_response, created_at, updated_at
           FROM client_tickets WHERE client_account_id = $1 ORDER BY created_at DESC`,
          [accountId],
        );
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
      const result = await ctx.getPool().query(
        `SELECT t.id, t.client_account_id, a.display_name AS account_name, i.email AS opened_by_email,
                t.category, t.title, t.details, t.status, t.admin_response, t.created_at, t.updated_at
         FROM client_tickets t
         JOIN client_accounts a ON a.id = t.client_account_id
         JOIN auth_identities i ON i.id = t.opened_by_identity
         ${where} ORDER BY t.created_at DESC LIMIT 200`,
        values,
      );
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
    const db = ctx.getPool();
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
      await client.query(
        "UPDATE client_tickets SET status = $2, admin_response = COALESCE(NULLIF($3, ''), admin_response), updated_at = NOW() WHERE id = $1",
        [ticketId, body.status, responseText],
      );
      if (previousStatus !== body.status) {
        await client.query(
          `INSERT INTO client_ticket_status_audit
             (ticket_id, previous_status, next_status, changed_by, changed_by_identity)
           VALUES ($1,$2,$3,$4,$5)`,
          [ticketId, previousStatus, body.status, session.role, session.identityId],
        );
      }
      await audit(client, { actorKind: session.role, actorId: session.identityId, action: "ticket_status", target: ticketId, result: "allowed" });
      await client.query("COMMIT");
      return ctx.json(res, 200, { ticketId, previousStatus, status: body.status });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return databaseFailure(res, error, "Could not update the client ticket.");
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
  };
}
