// PLT-04: fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento

const ALLOWED_RECIPIENT_KINDS = new Set(["client","staff","lead","system","marcelo","ti","admin","rh"]);
const ALLOWED_CHANNELS = new Set(["email","whatsapp","sms","push","webhook","internal"]);

function isValidUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function backoffDelay(attempts) {
  // 1m, 5m, 15m, 60m, 240m
  const delays = [60_000, 5*60_000, 15*60_000, 60*60_000, 4*60*60_000];
  return delays[Math.min(attempts, delays.length-1)];
}

export function createNotificationQueue(ctx) {
  // ctx: { getPool, mailer?, observability? }

  async function audit(db, { action, target, result, actorKind, actorId }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind || "system", actorId || null, action, target || null, result, "none"]
      );
    } catch (e) {
      console.error("notification audit failed", e?.message);
    }
  }

  async function enqueue({ recipientKind, recipientId, recipientEmail, channel, template, payload, dedupKey, maxAttempts, createdBy, createdById }) {
    if (!ALLOWED_RECIPIENT_KINDS.has(recipientKind)) throw new Error("invalid_recipient_kind");
    if (!ALLOWED_CHANNELS.has(channel)) throw new Error("invalid_channel");
    if (typeof template !== "string" || template.length < 1 || template.length > 100) throw new Error("invalid_template");
    if (payload && typeof payload !== "object") throw new Error("invalid_payload");
    if (recipientId && typeof recipientId === "string" && recipientId.length > 200) throw new Error("invalid_recipient_id");
    if (recipientEmail && !isValidEmail(recipientEmail)) throw new Error("invalid_recipient_email");
    if (dedupKey && (typeof dedupKey !== "string" || dedupKey.length > 200)) throw new Error("invalid_dedup_key");
    if (recipientId && isValidUuid(recipientId) === false && recipientId.length === 36) throw new Error("invalid_recipient_id_uuid_format");
    // At least email or id required for non-system
    if (recipientKind !== "system" && !recipientId && !recipientEmail) throw new Error("recipient_required");

    const db = ctx.getPool();
    const id = crypto.randomUUID();
    const maxAtt = Math.min(20, Math.max(1, parseInt(maxAttempts || "5", 10) || 5));

    try {
      const result = await db.query(
        `INSERT INTO notification_queue (id, dedup_key, recipient_kind, recipient_id, recipient_email, channel, template, payload, status, max_attempts, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9,$10,$11)
         ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [id, dedupKey || null, recipientKind, recipientId || null, recipientEmail || null, channel, template, JSON.stringify(payload || {}), maxAtt, createdBy || null, createdById || null]
      );

      if (result.rows.length === 0) {
        // dedup hit
        const existing = await db.query("SELECT * FROM notification_queue WHERE dedup_key = $1", [dedupKey]);
        return { dedup: true, notification: existing.rows[0] };
      }

      await audit(db, { action: "notification_enqueue", target: id, result: "allowed", actorKind: createdBy || "system", actorId: createdById });

      return { dedup: false, notification: result.rows[0] };
    } catch (e) {
      if (String(e.message).includes("duplicate") || String(e.code) === "23505") {
        const existing = await db.query("SELECT * FROM notification_queue WHERE dedup_key = $1", [dedupKey]).catch(()=>({ rows: [] }));
        if (existing.rows[0]) return { dedup: true, notification: existing.rows[0] };
      }
      throw e;
    }
  }

  async function list({ status, channel, recipientKind, limit = 50, offset = 0 }) {
    const db = ctx.getPool();
    const conditions = [];
    const values = [];
    let idx = 1;
    if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
    if (channel) { conditions.push(`channel = $${idx++}`); values.push(channel); }
    if (recipientKind) { conditions.push(`recipient_kind = $${idx++}`); values.push(recipientKind); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const l = Math.min(200, Math.max(1, parseInt(limit,10)||50));
    const o = Math.max(0, parseInt(offset,10)||0);
    const q = `SELECT * FROM notification_queue ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    const countQ = `SELECT COUNT(*)::int as total FROM notification_queue ${where}`;
    const [rows, count] = await Promise.all([
      db.query(q, [...values, l, o]),
      db.query(countQ, values)
    ]);
    return { notifications: rows.rows, total: count.rows[0]?.total || 0, limit: l, offset: o };
  }

  async function processNext({ batchSize = 10, mailer } = {}) {
    const db = ctx.getPool();
    const obs = ctx.observability || null;
    const startAll = Date.now();
    // Select due notifications
    const due = await db.query(
      `SELECT * FROM notification_queue WHERE status IN ('queued','failed') AND next_attempt_at <= NOW() ORDER BY next_attempt_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    const results = [];
    for (const row of due.rows) {
      const id = row.id;
      try {
        await db.query("UPDATE notification_queue SET status = 'sending', attempts = attempts + 1, updated_at = NOW() WHERE id = $1", [id]);

        let sendResult = "not_configured";
        let error = null;

        // Try to send based on channel
        if (row.channel === "email") {
          if (mailer && row.recipient_email) {
            try {
              // mailer is nodemailer transport? We use ctx.mailer as function trySend?
              // For simplicity, if ctx has sendMail capability, we attempt
              if (typeof mailer === "function") {
                sendResult = await mailer(row);
              } else if (mailer && typeof mailer.sendMail === "function") {
                await mailer.sendMail({
                  to: row.recipient_email,
                  subject: `[${row.template}] Notificação Grupo SEG`,
                  text: JSON.stringify(row.payload, null, 2)
                });
                sendResult = "sent";
              } else {
                sendResult = "not_configured";
              }
            } catch (e) {
              error = String(e.message).slice(0, 1000);
              sendResult = "failed";
            }
          } else {
            sendResult = "not_configured";
          }
        } else {
          // For whatsapp/sms/push/webhook/internal, we don't have provider configured yet — mark as failed with not_configured, will retry until max attempts then dead
          sendResult = "not_configured";
        }

        if (sendResult === "sent") {
          await db.query("UPDATE notification_queue SET status = 'sent', sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1", [id]);
          await audit(db, { action: "notification_send", target: id, result: "allowed" });
          results.push({ id, status: "sent" });
          if (obs) obs.recordJob({ job_name: 'notification_send', correlation_id: globalThis.__currentCorrelationId || null, request_id: globalThis.__currentRequestId || null, status: 'success', duration_ms: Date.now() - startAll, attempts: row.attempts + 1, metadata: { channel: row.channel, template: row.template } });
        } else {
          const attempts = row.attempts + 1;
          const maxAttempts = row.max_attempts;
          if (attempts >= maxAttempts) {
            await db.query("UPDATE notification_queue SET status = 'dead', last_error = $2, next_attempt_at = NOW() + INTERVAL '1 day', updated_at = NOW() WHERE id = $1", [id, error || sendResult]);
            await audit(db, { action: "notification_dead", target: id, result: "allowed" });
            results.push({ id, status: "dead", error: error || sendResult });
            if (obs) obs.recordJob({ job_name: 'notification_send', correlation_id: globalThis.__currentCorrelationId || null, request_id: globalThis.__currentRequestId || null, status: 'dead', duration_ms: Date.now() - startAll, attempts, error: error || sendResult, metadata: { channel: row.channel } });
          } else {
            const delay = backoffDelay(attempts);
            await db.query("UPDATE notification_queue SET status = 'failed', last_error = $2, next_attempt_at = NOW() + ($3 || ' milliseconds')::interval, updated_at = NOW() WHERE id = $1", [id, error || sendResult, String(delay)]);
            await audit(db, { action: "notification_failed", target: id, result: "allowed" });
            results.push({ id, status: "failed", nextAttemptInMs: delay, error: error || sendResult });
            if (obs) obs.recordJob({ job_name: 'notification_send', correlation_id: globalThis.__currentCorrelationId || null, request_id: globalThis.__currentRequestId || null, status: 'failed', duration_ms: Date.now() - startAll, attempts, error: error || sendResult, metadata: { channel: row.channel } });
          }
        }
      } catch (e) {
        console.error("process notification failed", id, e?.message);
        try {
          await db.query("UPDATE notification_queue SET status = 'failed', last_error = $2, next_attempt_at = NOW() + INTERVAL '5 minutes', updated_at = NOW() WHERE id = $1", [id, String(e.message).slice(0,1000)]);
        } catch {}
        results.push({ id, status: "error", error: String(e.message) });
        if (obs) obs.recordJob({ job_name: 'notification_send', status: 'failed', duration_ms: Date.now() - startAll, error: e, metadata: { id } });
      }
    }

    return results;
  }

  async function retry(id, { actorKind, actorId } = {}) {
    const db = ctx.getPool();
    const res = await db.query("UPDATE notification_queue SET status = 'queued', next_attempt_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1 AND status IN ('failed','dead') RETURNING *", [id]);
    if (res.rows.length === 0) throw new Error("not_found_or_not_retryable");
    await audit(db, { action: "notification_retry", target: id, result: "allowed", actorKind, actorId });
    return res.rows[0];
  }

  return { enqueue, list, processNext, retry };
}
