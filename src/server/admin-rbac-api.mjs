import { randomUUID } from "node:crypto";
import { grantPermission, revokePermission, isValidPermission, isValidScopeType, KNOWN_PERMISSIONS } from "./rbac.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAdminRbacApi(ctx) {
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
  async function readJsonOr400(req, res) {
    try {
      return await ctx.readJson(req);
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
    return session;
  }
  function databaseFailure(res, error, context) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && error.code === "42P01";
    if (!unconfigured && !migrationMissing) console.error(context, error);
    return ctx.json(res, 503, { error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "rbac_unavailable" });
  }

  async function handleListPermissions(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const identityId = url.searchParams.get("identity");
    const permission = url.searchParams.get("permission");
    if (identityId && !UUID_PATTERN.test(identityId)) return ctx.json(res, 400, { error: "invalid_identity_id" });
    if (permission && !isValidPermission(permission)) return ctx.json(res, 400, { error: "invalid_permission" });
    try {
      const db = ctx.getPool();
      const conditions = ["p.revoked_at IS NULL"];
      const values = [];
      if (identityId) {
        values.push(identityId);
        conditions.push(`p.identity_id = $${values.length}`);
      }
      if (permission) {
        values.push(permission);
        conditions.push(`p.permission = $${values.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await db.query(
        `SELECT p.id, p.identity_id, i.email, i.kind, p.permission, p.scope_type, p.scope_id, p.reason, p.granted_by, p.granted_by_role, p.created_at
         FROM auth_permissions p
         JOIN auth_identities i ON i.id = p.identity_id
         ${where}
         ORDER BY p.created_at DESC LIMIT 200`,
        values
      );
      return ctx.json(res, 200, { permissions: result.rows, knownPermissions: KNOWN_PERMISSIONS });
    } catch (error) {
      return databaseFailure(res, error, "Could not list permissions.");
    }
  }

  async function handleGrantPermission(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const identityId = String(body?.identityId || "");
    const permission = String(body?.permission || "");
    const scopeType = String(body?.scopeType || "global");
    const scopeId = body?.scopeId ? String(body.scopeId) : null;
    const reason = String(body?.reason || "").trim();

    if (!UUID_PATTERN.test(identityId)) return ctx.json(res, 400, { error: "invalid_identity_id" });
    if (!isValidPermission(permission)) return ctx.json(res, 400, { error: "invalid_permission" });
    if (!isValidScopeType(scopeType)) return ctx.json(res, 400, { error: "invalid_scope_type" });
    if (scopeId && !UUID_PATTERN.test(scopeId)) return ctx.json(res, 400, { error: "invalid_scope_id" });
    if (!reason || reason.length < 1 || reason.length > 500) return ctx.json(res, 400, { error: "reason_required" });

    try {
      const db = ctx.getPool();
      // Check identity exists and active
      const idCheck = await db.query(`SELECT id, status FROM auth_identities WHERE id = $1`, [identityId]);
      if (!idCheck.rows[0]) return ctx.json(res, 404, { error: "identity_not_found" });
      if (idCheck.rows[0].status === "disabled") return ctx.json(res, 409, { error: "identity_disabled" });

      const permId = await grantPermission(db, {
        identityId,
        permission,
        scopeType,
        scopeId,
        grantedBy: session.identityId || null,
        grantedByRole: session.role,
        reason,
      });
      return ctx.json(res, 201, { permissionId: permId });
    } catch (error) {
      if (error && error.message === "invalid_permission") return ctx.json(res, 400, { error: "invalid_permission" });
      if (error && error.code === "23505") return ctx.json(res, 409, { error: "permission_exists" });
      return databaseFailure(res, error, "Could not grant permission.");
    }
  }

  async function handleRevokePermission(req, res, permissionId) {
    if (!requireMethod(req, res, ["DELETE", "POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!UUID_PATTERN.test(permissionId)) return ctx.json(res, 400, { error: "invalid_permission_id" });
    let body = {};
    try {
      body = await ctx.readJson(req);
    } catch {
      return ctx.json(res, 400, { error: "invalid_request" });
    }
    const reason = String(body?.reason || "").trim();
    if (!reason) return ctx.json(res, 400, { error: "reason_required" });

    try {
      const db = ctx.getPool();
      const result = await revokePermission(db, {
        permissionId,
        revokedBy: session.identityId || null,
        revokeReason: reason,
      });
      return ctx.json(res, 200, { ok: true, outcome: result.outcome });
    } catch (error) {
      if (error && error.message === "permission_not_found") return ctx.json(res, 404, { error: "permission_not_found" });
      return databaseFailure(res, error, "Could not revoke permission.");
    }
  }

  async function handleAccessReviews(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (req.method === "GET") {
      try {
        const db = ctx.getPool();
        const result = await db.query(
          `SELECT r.id, r.reviewed_by, rb.email AS reviewer_email, r.target_identity_id, rt.email AS target_email, r.decision, r.notes, r.created_at
           FROM auth_access_reviews r
           JOIN auth_identities rb ON rb.id = r.reviewed_by
           JOIN auth_identities rt ON rt.id = r.target_identity_id
           ORDER BY r.created_at DESC LIMIT 100`
        );
        return ctx.json(res, 200, { reviews: result.rows });
      } catch (error) {
        return databaseFailure(res, error, "Could not list access reviews.");
      }
    }
    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const targetId = String(body?.targetIdentityId || "");
      const decision = String(body?.decision || "");
      const notes = String(body?.notes || "").trim() || null;
      if (!UUID_PATTERN.test(targetId)) return ctx.json(res, 400, { error: "invalid_target_id" });
      if (!["keep","revoke","adjust"].includes(decision)) return ctx.json(res, 400, { error: "invalid_decision" });
      if (notes && notes.length > 1000) return ctx.json(res, 400, { error: "notes_too_long" });
      try {
        const db = ctx.getPool();
        const id = randomUUID();
        await db.query(
          `INSERT INTO auth_access_reviews (id, reviewed_by, target_identity_id, decision, notes) VALUES ($1,$2,$3,$4,$5)`,
          [id, session.identityId, targetId, decision, notes]
        );
        await db.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('staff',$1,'access_review',$2,'allowed','none')`,
          [session.identityId, targetId]
        ).catch(()=>{});
        return ctx.json(res, 201, { reviewId: id });
      } catch (error) {
        return databaseFailure(res, error, "Could not create access review.");
      }
    }
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  return {
    handleListPermissions,
    handleGrantPermission,
    handleRevokePermission,
    handleAccessReviews,
  };
}
