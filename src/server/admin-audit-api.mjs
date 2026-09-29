// PLT-02: auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada
// SEC-14: auditoria durável e operacional
// SEC-13: sameOrigin, JSON limitado, erro sem stack

const ALLOWED_ACTIONS = new Set([
  "invite_issue","invite_revoke","invite_accept",
  "login","logout","session_revoke_all",
  "email_confirm","email_confirm_resend",
  "password_reset_request","password_reset_complete",
  "account_create","account_status",
  "grant_issue","grant_revoke",
  "contract_create","contract_status","contract_list",
  "document_upload","document_download","document_list",
  "ticket_open","ticket_status","ticket_list",
  "mfa_activate","mfa_verify","mfa_disable","mfa_recovery_use","mfa_challenge_issue","mfa_challenge_verify",
  "email_change_request","email_change_confirm","email_change_cancel","email_change_alert",
  "grant_contract_restrict","grant_unit_restrict",
  "staff_invite","staff_login","staff_role_change","staff_session_revoke",
  "permission_grant","permission_revoke","access_review",
  "assignment_create","assignment_end","assignment_suspend",
  "scale_create","scale_update",
  "time_entry_start","time_entry_end","time_entry_ronda",
  "handover_create","handover_accept",
  "audit_query","audit_export","invite_rate_limited",
  "notification_enqueue","notification_send","notification_failed","notification_dead","notification_retry"
]);

const ALLOWED_RESULTS = new Set(["allowed","denied","error"]);
const ALLOWED_ACTOR_KINDS = new Set(["client","marcelo","ti","system","staff","admin","rh"]);

function isValidUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function parseDateParam(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function createAdminAuditApi(ctx) {
  // ctx: { json, readJson, sameOrigin, getPool, readAdminSession, clientIp }

  async function audit(db, { actorKind, actorId, action, target, result, category }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind, actorId || null, action, target || null, result, category || "none"]
      );
    } catch (e) {
      console.error("Could not record audit query", e?.message);
    }
  }

  function requireMethod(req, res, allowed) {
    if (!allowed.includes(req.method)) {
      ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: allowed.join(", ") });
      return false;
    }
    return true;
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function requireAdminSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  async function handleAuditList(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    const actorKind = url.searchParams.get("actorKind");
    const actorId = url.searchParams.get("actorId");
    const action = url.searchParams.get("action");
    const target = url.searchParams.get("target");
    const result = url.searchParams.get("result");
    const detailCategory = url.searchParams.get("detail_category") || url.searchParams.get("category");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");

    const limit = Math.min(200, Math.max(1, parseInt(limitRaw || "50", 10) || 50));
    const offset = Math.max(0, parseInt(offsetRaw || "0", 10) || 0);

    if (actorKind && !ALLOWED_ACTOR_KINDS.has(actorKind)) return ctx.json(res, 400, { error: "invalid_actor_kind" });
    if (action && !ALLOWED_ACTIONS.has(action)) return ctx.json(res, 400, { error: "invalid_action" });
    if (result && !ALLOWED_RESULTS.has(result)) return ctx.json(res, 400, { error: "invalid_result" });
    if (actorId && actorId.length > 200) return ctx.json(res, 400, { error: "invalid_actor_id" });
    if (target && target.length > 500) return ctx.json(res, 400, { error: "invalid_target" });

    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to);
    if (from && !fromDate) return ctx.json(res, 400, { error: "invalid_from_date" });
    if (to && !toDate) return ctx.json(res, 400, { error: "invalid_to_date" });

    let db;
    try {
      db = ctx.getPool();
    } catch (e) {
      return ctx.json(res, 503, { error: "database_not_configured" });
    }

    try {
      const conditions = [];
      const values = [];
      let idx = 1;

      if (actorKind) { conditions.push(`actor_kind = $${idx++}`); values.push(actorKind); }
      if (actorId) { conditions.push(`actor_id = $${idx++}`); values.push(actorId); }
      if (action) { conditions.push(`action = $${idx++}`); values.push(action); }
      if (target) { conditions.push(`target = $${idx++}`); values.push(target); }
      if (result) { conditions.push(`result = $${idx++}`); values.push(result); }
      if (detailCategory) { conditions.push(`detail_category = $${idx++}`); values.push(detailCategory); }
      if (fromDate) { conditions.push(`created_at >= $${idx++}`); values.push(fromDate.toISOString()); }
      if (toDate) { conditions.push(`created_at <= $${idx++}`); values.push(toDate.toISOString()); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const query = `SELECT id, actor_kind, actor_id, action, target, result, detail_category, created_at FROM auth_access_audit ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
      const countQuery = `SELECT COUNT(*)::int as total FROM auth_access_audit ${where}`;

      const listValues = [...values, limit, offset];
      const [resultRows, countRows] = await Promise.all([
        db.query(query, listValues),
        db.query(countQuery, values)
      ]);

      // Auditar a consulta (não falha se auditoria falhar)
      await audit(db, {
        actorKind: "staff",
        actorId: session.identityId || session.role,
        action: "audit_query",
        target: `filters:${JSON.stringify({ actorKind, action, result, from, to })}`.slice(0, 500),
        result: "allowed",
        category: "none"
      });

      return ctx.json(res, 200, {
        audits: resultRows.rows,
        total: countRows.rows[0]?.total || 0,
        limit,
        offset,
        role: session.role,
        identityId: session.identityId || null
      });
    } catch (error) {
      console.error("audit list failed", error?.message);
      return ctx.json(res, 503, { error: "audit_unavailable" });
    }
  }

  async function handleAuditExport(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    let body;
    try {
      body = await ctx.readJson(req, 15 * 1024);
    } catch {
      return ctx.json(res, 400, { error: "invalid_request" });
    }

    const filters = body?.filters || {};
    const actorKind = filters.actorKind || null;
    const action = filters.action || null;
    const result = filters.result || null;
    const from = filters.from || null;
    const to = filters.to || null;
    const format = body?.format || "json";

    if (actorKind && !ALLOWED_ACTOR_KINDS.has(actorKind)) return ctx.json(res, 400, { error: "invalid_actor_kind" });
    if (action && !ALLOWED_ACTIONS.has(action)) return ctx.json(res, 400, { error: "invalid_action" });
    if (result && !ALLOWED_RESULTS.has(result)) return ctx.json(res, 400, { error: "invalid_result" });
    if (!["json","csv"].includes(format)) return ctx.json(res, 400, { error: "invalid_format" });

    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to);
    if (from && !fromDate) return ctx.json(res, 400, { error: "invalid_from_date" });
    if (to && !toDate) return ctx.json(res, 400, { error: "invalid_to_date" });

    let db;
    try {
      db = ctx.getPool();
    } catch {
      return ctx.json(res, 503, { error: "database_not_configured" });
    }

    try {
      const conditions = [];
      const values = [];
      let idx = 1;
      if (actorKind) { conditions.push(`actor_kind = $${idx++}`); values.push(actorKind); }
      if (action) { conditions.push(`action = $${idx++}`); values.push(action); }
      if (result) { conditions.push(`result = $${idx++}`); values.push(result); }
      if (fromDate) { conditions.push(`created_at >= $${idx++}`); values.push(fromDate.toISOString()); }
      if (toDate) { conditions.push(`created_at <= $${idx++}`); values.push(toDate.toISOString()); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const query = `SELECT id, actor_kind, actor_id, action, target, result, detail_category, created_at FROM auth_access_audit ${where} ORDER BY created_at DESC LIMIT 1000`;

      const rows = await db.query(query, values);

      await audit(db, {
        actorKind: "staff",
        actorId: session.identityId || session.role,
        action: "audit_export",
        target: `export:${rows.rows.length} format:${format} filters:${JSON.stringify(filters).slice(0,300)}`,
        result: "allowed",
        category: "none"
      });

      if (format === "csv") {
        const header = "id,actor_kind,actor_id,action,target,result,detail_category,created_at";
        const lines = rows.rows.map(r => {
          const esc = (v) => `"${String(v ?? "").replace(/\"/g, '\"\"')}"`;
          return [r.id, r.actor_kind, r.actor_id, r.action, r.target, r.result, r.detail_category, r.created_at].map(esc).join(",");
        });
        const csv = [header, ...lines].join("\n");
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"audit-export-${Date.now()}.csv\"`,
          "Cache-Control": "no-store"
        });
        return res.end(csv);
      }

      return ctx.json(res, 200, { audits: rows.rows, exported: rows.rows.length, format });
    } catch (error) {
      console.error("audit export failed", error?.message);
      return ctx.json(res, 503, { error: "audit_export_unavailable" });
    }
  }

  return {
    handleAuditList,
    handleAuditExport
  };
}
