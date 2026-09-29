// PLT-04: API para fila durável de notificações

const ALLOWED_STATUS = new Set(["queued","sending","sent","failed","dead"]);
const ALLOWED_CHANNELS = new Set(["email","whatsapp","sms","push","webhook","internal"]);
const ALLOWED_RECIPIENT_KINDS = new Set(["client","staff","lead","system","marcelo","ti","admin","rh"]);

export function createAdminNotificationsApi(ctx) {
  // ctx: { json, readJson, sameOrigin, getPool, readAdminSession, notificationQueue, mailer }

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
    const session = ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  async function handleList(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const recipientKind = url.searchParams.get("recipientKind") || url.searchParams.get("recipient_kind");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    if (status && !ALLOWED_STATUS.has(status)) return ctx.json(res, 400, { error: "invalid_status" });
    if (channel && !ALLOWED_CHANNELS.has(channel)) return ctx.json(res, 400, { error: "invalid_channel" });
    if (recipientKind && !ALLOWED_RECIPIENT_KINDS.has(recipientKind)) return ctx.json(res, 400, { error: "invalid_recipient_kind" });

    try {
      const result = await ctx.notificationQueue.list({ status, channel, recipientKind, limit, offset });
      return ctx.json(res, 200, { ...result, role: session.role });
    } catch (e) {
      console.error("list notifications failed", e?.message);
      return ctx.json(res, 503, { error: "notifications_unavailable" });
    }
  }

  async function handleEnqueue(req, res) {
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

    const recipientKind = String(body?.recipientKind || body?.recipient_kind || "").toLowerCase();
    const recipientId = body?.recipientId || body?.recipient_id || null;
    const recipientEmail = body?.recipientEmail || body?.recipient_email || null;
    const channel = String(body?.channel || "").toLowerCase();
    const template = String(body?.template || "").trim();
    const payload = body?.payload || {};
    const dedupKey = body?.dedupKey || body?.dedup_key || null;
    const maxAttempts = body?.maxAttempts || body?.max_attempts || 5;

    if (!ALLOWED_RECIPIENT_KINDS.has(recipientKind)) return ctx.json(res, 400, { error: "invalid_recipient_kind" });
    if (!ALLOWED_CHANNELS.has(channel)) return ctx.json(res, 400, { error: "invalid_channel" });
    if (!template || template.length > 100) return ctx.json(res, 400, { error: "invalid_template" });
    if (payload && typeof payload !== "object") return ctx.json(res, 400, { error: "invalid_payload" });
    if (dedupKey && (typeof dedupKey !== "string" || dedupKey.length > 200)) return ctx.json(res, 400, { error: "invalid_dedup_key" });

    try {
      const result = await ctx.notificationQueue.enqueue({
        recipientKind,
        recipientId,
        recipientEmail,
        channel,
        template,
        payload,
        dedupKey,
        maxAttempts,
        createdBy: session.role,
        createdById: session.identityId || null
      });
      return ctx.json(res, result.dedup ? 200 : 201, { notification: result.notification, dedup: result.dedup });
    } catch (e) {
      const msg = String(e.message);
      if (msg.includes("invalid_")) return ctx.json(res, 400, { error: msg });
      console.error("enqueue notification failed", msg);
      return ctx.json(res, 503, { error: "enqueue_failed" });
    }
  }

  async function handleRetry(req, res, id) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return ctx.json(res, 400, { error: "invalid_notification_id" });
    }

    try {
      const notification = await ctx.notificationQueue.retry(id, { actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 200, { notification });
    } catch (e) {
      if (String(e.message).includes("not_found")) return ctx.json(res, 404, { error: "not_found_or_not_retryable" });
      console.error("retry notification failed", e?.message);
      return ctx.json(res, 503, { error: "retry_failed" });
    }
  }

  async function handleProcess(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;

    // Only ti/admin can trigger processing manually
    if (!["ti","admin","marcelo"].includes(session.role)) {
      return ctx.json(res, 403, { error: "forbidden" });
    }

    try {
      const results = await ctx.notificationQueue.processNext({ batchSize: 10, mailer: ctx.mailer });
      return ctx.json(res, 200, { processed: results.length, results });
    } catch (e) {
      console.error("process notifications failed", e?.message);
      return ctx.json(res, 503, { error: "process_failed" });
    }
  }

  return { handleList, handleEnqueue, handleRetry, handleProcess };
}
