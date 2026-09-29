// API real de acesso do cliente (etapa 1 do portal).
// Depende de PostgreSQL (db/migrations/003-client-access.sql). Sem banco configurado,
// responde graciosamente com database_not_configured, seguindo o padrão dos pedidos públicos.
//
// Decisões implementadas (docs/portal-acesso-e-seguranca.md):
// - convite como modo inicial; validade de 7 dias, uso único, revogável antes do uso;
// - senha do cliente com mínimo de 12 caracteres, frases-senha aceitas, senhas comuns rejeitadas;
// - senha + confirmação de e-mail (link de confirmação com 7 dias, uso único);
// - recuperação de senha por link de uso único com 1 hora de validade, resposta pública genérica;
// - reenvio limitado a 5 por endereço em 24 horas, intervalo mínimo de 2 minutos,
//   e cada novo link invalida o anterior;
// - espera progressiva após a 5ª falha de login (1, 5 e 15 minutos), por conta e origem,
//   zerando após sucesso ou 24 horas sem falhas;
// - tokens nunca são persistidos em claro: somente hashes SHA-256; senhas com scrypt;
// - sessões do cliente revogáveis no servidor; troca de senha encerra todas as sessões;
// - trilha de auditoria com categorias fechadas, retenção prevista de 12 meses
//   (exclusão automática ainda não está ativa).

import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { resolveDeliveryTarget, LOCAL_OUTBOX_LABEL } from "./local-outbox.mjs";
import { decryptMfaSecret, mfaKey, verifyMfaCode, hashRecoveryCode } from "../lib/client-mfa.mjs";
import {
  CONFIRM_EMAIL_TTL_MS,
  INVITE_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  SESSION_TTL_MS,
  generateToken,
  hashOrigin,
  hashPassword,
  hashToken,
  loginThrottleDelaySeconds,
  normalizeEmail,
  resendPolicyAllows,
  throttleShouldReset,
  validatePasswordPolicy,
  verifyPassword,
} from "../lib/client-auth-core.mjs";

export const CLIENT_SESSION_COOKIE = "seg_client_session";

const INVITE_STATUSES = new Set(["pending", "used", "expired", "revoked"]);

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown";
}

async function audit(db, { actorKind, actorId = null, action, target = null, result, category = "none" }) {
  try {
    await db.query(
      "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
      [actorKind, actorId, action, target, result, category],
    );
  } catch (error) {
    console.error("Could not record client access audit.", { action, message: errorMessage(error) });
  }
}

function databaseFailure(ctx, res, error, context) {
  const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
  const migrationMissing = error && typeof error === "object" && error.code === "42P01";
  if (!unconfigured) console.error(context, errorMessage(error));
  return ctx.json(res, 503, {
    error: unconfigured ? "database_not_configured" : migrationMissing ? "migration_required" : "auth_unavailable",
  });
}

function readCookie(req, name) {
  const cookieHeader = String(req.headers.cookie || "");
  const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : null;
}

function inviteStatusOf(row, now = Date.now()) {
  if (row.used_at) return "used";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= now) return "expired";
  return "pending";
}

function sanitizeDisplayName(candidate) {
  if (candidate === undefined || candidate === null || candidate === "") return { value: null };
  if (typeof candidate !== "string") return { error: "invalid_display_name" };
  const value = candidate.trim();
  if (!value) return { value: null };
  if (value.length > 120) return { error: "invalid_display_name" };
  if (/[\u0000-\u001F<>]/.test(value)) return { error: "invalid_display_name" };
  return { value };
}

let dummyHashPromise;
function comparableHash(stored) {
  if (typeof stored === "string" && stored) return Promise.resolve(stored);
  dummyHashPromise ??= hashPassword("senha-comparacao-constante-inexistente");
  return dummyHashPromise;
}

async function sendAuthEmail({ to, subject, text }) {
  const { MAIL_HOST, MAIL_FROM } = process.env;
  if (!MAIL_HOST || !MAIL_FROM) return "not_configured";
  const port = Number(process.env.MAIL_PORT || 587);
  const auth = process.env.MAIL_USER && process.env.MAIL_PASSWORD
    ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
    : undefined;
  const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port,
    secure: process.env.MAIL_SECURE === "true" || port === 465,
    auth,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  });
  await transporter.sendMail({ from: MAIL_FROM, to, subject, text });
  return "sent";
}

/**
 * L02 — entrega de comunicação de autenticação.
 * Sem SMTP (o caso desta entrega), grava na CAIXA LOCAL e devolve
 * "local_outbox". Nunca devolve "sent" sem envio real.
 */
async function trySendAuthEmail(options, localOutbox = null) {
  const target = resolveDeliveryTarget();
  if (target === "local_outbox") {
    if (!localOutbox) return "not_configured";
    try {
      await localOutbox.deliver({
        recipientKind: options.recipientKind || "client",
        recipientId: options.recipientId || null,
        recipientAddress: options.to,
        channel: "email",
        template: options.template || "auth_message",
        subject: options.subject,
        body: options.text,
        expiresAt: options.expiresAt || null,
      });
      return "local_outbox";
    } catch (error) {
      console.error("Local outbox delivery failed.", { subject: options.subject, message: errorMessage(error) });
      return "failed";
    }
  }
  try {
    return await sendAuthEmail(options);
  } catch (error) {
    console.error("Client access email failed.", { subject: options.subject, message: errorMessage(error) });
    return "failed";
  }
}

export function createClientAccessApi(ctx) {
  function clientCookie(req, value, maxAgeSeconds) {
    return `${CLIENT_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${ctx.cookieSecure(req) ? "; Secure" : ""}`;
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

  async function readJsonOr400(req, res) {
    try {
      return await ctx.readJson(req);
    } catch (error) {
      ctx.json(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "invalid_request" });
      return undefined;
    }
  }

  async function recentEmailTokenTimestamps(db, email, kind) {
    const result = await db.query(
      `SELECT created_at FROM auth_email_tokens
       WHERE email = $1 AND kind = $2 AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC`,
      [email, kind],
    );
    return result.rows.map(row => row.created_at);
  }

  async function readClientSession(req) {
    const raw = readCookie(req, CLIENT_SESSION_COOKIE);
    if (!raw || raw.length > 200) return null;
    let db;
    try {
      db = ctx.getPool();
    } catch {
      return null;
    }
    let result;
    try {
      result = await db.query(
        `SELECT s.id AS session_id, s.expires_at, s.revoked_at, s.mfa_verified_at,
                i.id AS identity_id, i.email, i.display_name, i.status, i.verification_method,
                m.activated_at AS mfa_activated_at, m.totp_secret_encrypted AS mfa_secret
         FROM auth_sessions s
         JOIN auth_identities i ON i.id = s.identity_id
         LEFT JOIN auth_mfa m ON m.identity_id = i.id
         WHERE s.token_hash = $1`,
        [hashToken(raw)],
      );
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "42P01")) {
        console.error("Could not read the client session.", errorMessage(error));
      }
      return null;
    }
    const row = result.rows[0];
    if (!row || row.revoked_at) return null;
    // MFA proof belongs to THIS session and must postdate the most recent
    // activation. Legacy password-only cookies never gain access retroactively.
    if (row.mfa_activated_at) {
      try { decryptMfaSecret(row.mfa_secret, row.identity_id); } catch { return null; }
      if (!row.mfa_verified_at || new Date(row.mfa_verified_at) < new Date(row.mfa_activated_at)) return null;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    if (row.status === "suspended" || row.status === "disabled") {
      await db
        .query("UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'status_block' WHERE id = $1 AND revoked_at IS NULL", [row.session_id])
        .catch(() => {});
      await audit(db, {
        actorKind: "system",
        action: "session_revoke_all",
        target: row.identity_id,
        result: "allowed",
        category: "authorization_denied",
      });
      return null;
    }
    // A password-only session created while awaiting review is never promoted
    // by a later approval. Legacy active identities with unknown provenance
    // must be reviewed instead of being implicitly treated as verified.
    if (row.status !== 'active' || !['email_link', 'manual'].includes(row.verification_method)) return null;
    db.query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]).catch(() => {});
    return {
      sessionId: row.session_id,
      identityId: row.identity_id,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      verificationMethod: row.verification_method,
      mfaEnabled: Boolean(row.mfa_activated_at),
      expiresAt: new Date(row.expires_at).getTime(),
    };
  }

  async function handleLogin(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const email = normalizeEmail(body?.email);
    if (email.error) return ctx.json(res, 400, { error: "invalid_email" });
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) return ctx.json(res, 400, { error: "invalid_credentials" });

    const originHash = hashOrigin(ctx.clientIp(req));
    let db;
    try {
      db = ctx.getPool();
      const throttle = await db.query(
        "SELECT locked_until FROM auth_login_throttle WHERE email = $1 AND origin_hash = $2",
        [email.value, originHash],
      );
      const lockedUntil = throttle.rows[0]?.locked_until;
      if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
        const retryAfterSeconds = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000);
        const lockedIdentity = await db.query("SELECT id FROM auth_identities WHERE kind = 'client' AND email = $1", [email.value]);
        await audit(db, {
          actorKind: "client",
          actorId: lockedIdentity.rows[0]?.id || null,
          action: "login",
          result: "denied",
          category: "throttled",
        });
        return ctx.json(res, 429, { error: "temporarily_limited" }, { "Retry-After": String(retryAfterSeconds) });
      }
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not check the login throttle.");
    }

    let record;
    try {
      const found = await db.query(
        `SELECT i.id, i.status, i.verification_method, i.display_name, c.password_hash,
                (m.activated_at IS NOT NULL) AS mfa_active, m.totp_secret_encrypted AS mfa_secret
         FROM auth_identities i
         LEFT JOIN auth_credentials c ON c.identity_id = i.id
         LEFT JOIN auth_mfa m ON m.identity_id = i.id
         WHERE i.kind = 'client' AND i.email = $1`,
        [email.value],
      );
      record = found.rows[0] || null;
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not load the client identity.");
    }

    const hash = await comparableHash(record?.password_hash);
    const passwordMatches = await verifyPassword(password, hash);
    const valid = Boolean(record) && passwordMatches;
    if (!valid) {
      await registerLoginFailure(db, email.value, originHash, record?.id || null);
      return ctx.json(res, 401, { error: "invalid_credentials" });
    }
    if (record.status !== "active" || !['email_link', 'manual'].includes(record.verification_method)) {
      await audit(db, { actorKind: "client", actorId: record.id, action: "login", target: record.id, result: "denied", category: "authorization_denied" });
      return ctx.json(res, record.status === 'pending_email' || record.status === 'active' ? 403 : 401,
        { error: record.status === 'pending_email' || record.status === 'active' ? 'verification_required' : 'invalid_credentials' });
    }
    // A valid password is not sufficient once MFA is active. A short-lived,
    // one-use challenge is NOT an authenticated session/cookie.
    if (record.mfa_active) {
      try {
        decryptMfaSecret(record.mfa_secret, record.id);
        const challenge = generateToken();
        await db.query("UPDATE auth_mfa_challenges SET used_at = NOW() WHERE identity_id = $1 AND used_at IS NULL", [record.id]);
        await db.query(`INSERT INTO auth_mfa_challenges (id, identity_id, token_hash, expires_at)
          VALUES ($1,$2,$3,NOW() + INTERVAL '5 minutes')`, [randomUUID(), record.id, hashToken(challenge)]);
        await audit(db, { actorKind: 'client', actorId: record.id, action: 'mfa_challenge_issue', target: record.id, result: 'allowed' });
        return ctx.json(res, 202, { mfaRequired: true, challenge });
      } catch {
        // Bad/missing key and legacy plaintext secrets must NEVER downgrade MFA.
        return ctx.json(res, 503, { error: 'mfa_login_unavailable' });
      }
    }

    try {
      await db.query("DELETE FROM auth_login_throttle WHERE email = $1 AND origin_hash = $2", [email.value, originHash]);
    } catch (error) {
      console.error("Could not clear the login throttle.", errorMessage(error));
    }

    const token = generateToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    try {
      await db.query(
        `INSERT INTO auth_sessions (id, identity_id, token_hash, expires_at, ip_hash, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), record.id, hashToken(token), new Date(expiresAt), originHash, String(req.headers["user-agent"] || "").slice(0, 200)],
      );
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not create the client session.");
    }
    await audit(db, { actorKind: "client", actorId: record.id, action: "login", target: record.id, result: "allowed" });
    return ctx.json(res, 200, { ok: true, status: record.status,
      verificationMethod: record.verification_method, emailConfirmed: record.verification_method === 'email_link' }, {
      "Set-Cookie": clientCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)),
    });
  }

  async function handleMfaComplete(req, res) {
    if (!requireMethod(req, res, ['POST'])) return;
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const challenge = typeof body?.challenge === 'string' ? body.challenge : '';
    const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : '';
    if (!challenge || challenge.length > 200 || !(/^\d{6}$/.test(code) || hashRecoveryCode(code))) {
      return ctx.json(res, 400, { error: 'invalid_request' });
    }
    let db, client;
    try {
      mfaKey();
      db = ctx.getPool();
      client = await db.connect();
      await client.query('BEGIN');
      const { rows: [entry] } = await client.query(`SELECT c.id AS challenge_id, c.identity_id, c.expires_at,
          c.used_at, c.attempts, i.status, i.verification_method, i.email, m.totp_secret_encrypted,
          m.recovery_hashes, m.activated_at, m.last_used_step
        FROM auth_mfa_challenges c
        JOIN auth_identities i ON i.id = c.identity_id
        JOIN auth_mfa m ON m.identity_id = i.id
        WHERE c.token_hash = $1 AND i.kind = 'client' FOR UPDATE OF c, m`, [hashToken(challenge)]);
      if (!entry || entry.used_at || entry.attempts >= 5 || new Date(entry.expires_at) <= new Date() ||
          !entry.activated_at || entry.status !== 'active' || !['email_link', 'manual'].includes(entry.verification_method)) {
        await client.query('ROLLBACK');
        return ctx.json(res, 401, { error: 'mfa_challenge_invalid' });
      }
      const originHash = hashOrigin(ctx.clientIp(req));
      const throttle = await client.query('SELECT locked_until FROM auth_login_throttle WHERE email=$1 AND origin_hash=$2', [entry.email, originHash]);
      if (throttle.rows[0]?.locked_until && new Date(throttle.rows[0].locked_until) > new Date()) {
        await client.query('ROLLBACK');
        return ctx.json(res, 429, { error: 'temporarily_limited' });
      }
      const recoveryHash = hashRecoveryCode(code);
      let valid = false;
      if (recoveryHash && entry.recovery_hashes.includes(recoveryHash)) {
        await client.query('UPDATE auth_mfa SET recovery_hashes = array_remove(recovery_hashes, $2), last_verified_at=NOW(), attempts_since_verified=0 WHERE identity_id=$1', [entry.identity_id, recoveryHash]);
        valid = true;
      } else if (!recoveryHash) {
        const result = await verifyMfaCode(entry.totp_secret_encrypted, entry.identity_id, code, entry.last_used_step);
        if (result.valid) {
          const updated = await client.query(`UPDATE auth_mfa SET last_used_step=$2, last_verified_at=NOW(), attempts_since_verified=0
            WHERE identity_id=$1 AND (last_used_step IS NULL OR last_used_step < $2) RETURNING identity_id`, [entry.identity_id, result.timeStep]);
          valid = updated.rowCount === 1;
        }
      }
      if (!valid) {
        await client.query('UPDATE auth_mfa_challenges SET attempts=attempts+1 WHERE id=$1', [entry.challenge_id]);
        await client.query('COMMIT');
        await registerLoginFailure(db, entry.email, originHash, entry.identity_id);
        return ctx.json(res, 401, { error: 'mfa_code_invalid' });
      }
      const token = generateToken();
      const expiresAt = Date.now() + SESSION_TTL_MS;
      await client.query('UPDATE auth_mfa_challenges SET used_at=NOW() WHERE id=$1', [entry.challenge_id]);
      await client.query(`INSERT INTO auth_sessions (id, identity_id, token_hash, expires_at, ip_hash, user_agent, mfa_verified_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW())`, [randomUUID(), entry.identity_id, hashToken(token), new Date(expiresAt), originHash,
        String(req.headers['user-agent'] || '').slice(0, 200)]);
      await client.query('DELETE FROM auth_login_throttle WHERE email=$1 AND origin_hash=$2', [entry.email, originHash]);
      await client.query('COMMIT');
      await audit(db, { actorKind: 'client', actorId: entry.identity_id, action: 'mfa_challenge_verify', target: entry.identity_id, result: 'allowed' });
      return ctx.json(res, 200, { ok: true, status: entry.status,
        verificationMethod: entry.verification_method, emailConfirmed: entry.verification_method === 'email_link' },
        { 'Set-Cookie': clientCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)) });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return databaseFailure(ctx, res, error, 'Could not complete the MFA challenge.');
    } finally { client?.release(); }
  }

  async function registerLoginFailure(db, email, originHash, identityId) {
    try {
      const now = Date.now();
      const existing = await db.query(
        "SELECT failures, last_failure_at FROM auth_login_throttle WHERE email = $1 AND origin_hash = $2",
        [email, originHash],
      );
      const row = existing.rows[0];
      const lastAt = row?.last_failure_at ? new Date(row.last_failure_at).getTime() : 0;
      const failures = row && !throttleShouldReset(lastAt, now) ? row.failures + 1 : 1;
      const delaySeconds = loginThrottleDelaySeconds(failures);
      const lockedUntil = delaySeconds > 0 ? new Date(now + delaySeconds * 1000) : null;
      await db.query(
        `INSERT INTO auth_login_throttle (email, origin_hash, failures, locked_until, last_failure_at, updated_at)
         VALUES ($1,$2,$3,$4,NOW(),NOW())
         ON CONFLICT (email, origin_hash)
         DO UPDATE SET failures = $3, locked_until = $4, last_failure_at = NOW(), updated_at = NOW()`,
        [email, originHash, failures, lockedUntil],
      );
    } catch (error) {
      console.error("Could not register the login failure.", errorMessage(error));
    }
    await audit(db, {
      actorKind: "client",
      actorId: identityId,
      action: "login",
      target: identityId,
      result: "denied",
      category: "invalid_credentials",
    });
  }

  async function handleLogout(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await readClientSession(req);
    if (session) {
      let db;
      try {
        db = ctx.getPool();
        await db.query("UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'logout' WHERE id = $1", [session.sessionId]);
        await audit(db, { actorKind: "client", actorId: session.identityId, action: "logout", target: session.sessionId, result: "allowed" });
      } catch (error) {
        if (!(error && typeof error === "object" && error.code === "42P01")) {
          console.error("Could not close the client session.", errorMessage(error));
        }
      }
    }
    return ctx.json(res, 200, { ok: true }, { "Set-Cookie": clientCookie(req, "", 0) });
  }

  async function handleMe(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await readClientSession(req);
    if (!session) return ctx.json(res, 401, { error: "client_session_required" });
    return ctx.json(res, 200, {
      id: session.identityId,
      email: session.email,
      displayName: session.displayName,
      status: session.status,
      verificationMethod: session.verificationMethod,
      emailConfirmed: session.verificationMethod === 'email_link',
      mfaEnabled: session.mfaEnabled,
      expiresAt: session.expiresAt,
    });
  }

  async function handleInviteInspect(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    const token = String(url.searchParams.get("token") || "");
    if (!token || token.length > 200) return ctx.json(res, 200, { status: "not_found" });
    let db;
    try {
      db = ctx.getPool();
      const found = await db.query("SELECT email, expires_at, used_at, revoked_at FROM auth_invites WHERE token_hash = $1", [hashToken(token)]);
      const row = found.rows[0];
      if (!row) return ctx.json(res, 200, { status: "not_found" });
      const status = inviteStatusOf(row);
      return ctx.json(res, 200, status === "pending" ? { status, email: row.email, expiresAt: new Date(row.expires_at).getTime() } : { status });
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not inspect the client invite.");
    }
  }

  async function handleInviteAccept(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const token = String(body?.token || "");
    if (!token || token.length > 200) return ctx.json(res, 400, { error: "invite_not_found" });
    const displayName = sanitizeDisplayName(body?.displayName);
    if (displayName.error) return ctx.json(res, 400, { error: displayName.error });
    const passwordCheck = validatePasswordPolicy(body?.password);
    if (!passwordCheck.ok) return ctx.json(res, 400, { error: passwordCheck.error });

    let db;
    let client;
    try {
      db = ctx.getPool();
    } catch (error) {
      return databaseFailure(ctx, res, error, "Database is not configured.");
    }
    let identityId = null;
    let confirmToken = null;
    let inviteEmail = null;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const found = await client.query("SELECT id, email, expires_at, used_at, revoked_at FROM auth_invites WHERE token_hash = $1 FOR UPDATE", [hashToken(token)]);
      const invite = found.rows[0];
      if (!invite) {
        await client.query("ROLLBACK");
        await audit(db, { actorKind: "client", action: "invite_accept", result: "denied", category: "not_found" });
        return ctx.json(res, 400, { error: "invite_not_found" });
      }
      const status = inviteStatusOf(invite);
      if (status !== "pending") {
        await client.query("ROLLBACK");
        await audit(db, { actorKind: "client", action: "invite_accept", target: invite.id, result: "denied", category: status === "pending" ? "none" : status });
        return ctx.json(res, 400, { error: `invite_${status}` });
      }
      const existing = await client.query("SELECT id FROM auth_identities WHERE kind = 'client' AND email = $1", [invite.email]);
      if (existing.rows[0]) {
        await client.query("ROLLBACK");
        await audit(db, { actorKind: "client", action: "invite_accept", target: invite.id, result: "denied", category: "transition_invalid" });
        return ctx.json(res, 409, { error: "identity_exists" });
      }
      identityId = randomUUID();
      inviteEmail = invite.email;
      await client.query(
        "INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'client',$2,$3,'pending_email')",
        [identityId, inviteEmail, displayName.value],
      );
      await client.query("INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)", [identityId, await hashPassword(body.password)]);
      await client.query("UPDATE auth_invites SET used_at = NOW(), used_by_identity = $2 WHERE id = $1", [invite.id, identityId]);
      await client.query("UPDATE auth_email_tokens SET superseded_at = NOW() WHERE identity_id = $1 AND kind = 'confirm_email' AND used_at IS NULL AND superseded_at IS NULL", [identityId]);
      confirmToken = generateToken();
      await client.query(
        "INSERT INTO auth_email_tokens (id, identity_id, kind, email, token_hash, expires_at) VALUES ($1,$2,'confirm_email',$3,$4,$5)",
        [randomUUID(), identityId, inviteEmail, hashToken(confirmToken), new Date(Date.now() + CONFIRM_EMAIL_TTL_MS)],
      );
      await client.query("COMMIT");
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return databaseFailure(ctx, res, error, "Could not accept the client invite.");
    } finally {
      client?.release();
    }
    await audit(db, { actorKind: "client", actorId: identityId, action: "invite_accept", target: identityId, result: "allowed" });
    const confirmUrl = `${ctx.baseUrl}/cliente/confirmar-email?token=${confirmToken}`;
    const emailStatus = await trySendAuthEmail({
      to: inviteEmail,
      subject: "Confirme seu e-mail — Grupo SEG System",
      text: [
        "Seu cadastro inicial no portal do cliente foi criado.",
        "",
        "Confirme este endereço de e-mail abrindo o link abaixo (válido por 7 dias, uso único):",
        confirmUrl,
        "",
        "Se você não esperava este cadastro, ignore esta mensagem.",
        "Grupo SEG System Segurança Integrada",
      ].join("\n"),
      recipientKind: "client",
      recipientId: identityId,
      template: "client_email_confirm",
    }, ctx.localOutbox);
    return ctx.json(res, 201, { ok: true, email: inviteEmail, status: "pending_email", emailStatus });
  }

  async function handleEmailConfirm(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const token = String(body?.token || "");
    if (!token || token.length > 200) return ctx.json(res, 400, { error: "confirmation_link_invalid" });

    let db;
    let client;
    try {
      db = ctx.getPool();
      client = await db.connect();
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT id, identity_id, expires_at, used_at, superseded_at FROM auth_email_tokens WHERE kind = 'confirm_email' AND token_hash = $1 FOR UPDATE",
        [hashToken(token)],
      );
      const row = found.rows[0];
      const invalidCategory = !row
        ? "not_found"
        : row.used_at
          ? "used"
          : row.superseded_at
            ? "superseded"
            : new Date(row.expires_at).getTime() <= Date.now()
              ? "expired"
              : null;
      if (invalidCategory) {
        await client.query("ROLLBACK");
        await audit(db, { actorKind: "client", action: "email_confirm", target: row?.identity_id || null, result: "denied", category: invalidCategory });
        return ctx.json(res, 400, { error: "confirmation_link_invalid" });
      }
      await client.query("UPDATE auth_email_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
      await client.query(
        "UPDATE auth_email_tokens SET superseded_at = NOW() WHERE identity_id = $1 AND kind = 'confirm_email' AND used_at IS NULL AND superseded_at IS NULL",
        [row.identity_id],
      );
      const activated = await client.query(
        "UPDATE auth_identities SET status = 'active', verification_method='email_link', verified_at=NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending_email'",
        [row.identity_id],
      );
      if (activated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return ctx.json(res, 400, { error: 'confirmation_link_invalid' });
      }
      await client.query("COMMIT");
      await audit(db, { actorKind: "client", actorId: row.identity_id, action: "email_confirm", target: row.identity_id, result: "allowed" });
      return ctx.json(res, 200, { ok: true });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return databaseFailure(ctx, res, error, "Could not confirm the client e-mail.");
    } finally {
      client?.release();
    }
  }

  function createLinkResendHandler(kind, pagePath, ttlMs, auditAction, emailSubject, buildEmailText) {
    return async (req, res) => {
      if (!requireMethod(req, res, ["POST"])) return;
      if (!requireSameOrigin(req, res)) return;
      const body = await readJsonOr400(req, res);
      if (body === undefined) return;
      const email = normalizeEmail(body?.email);
      const generic = { ok: true };
      if (email.error) return ctx.json(res, 202, generic);

      let db;
      let identity = null;
      let rawToken = null;
      try {
        db = ctx.getPool();
        const found = await db.query("SELECT id, status FROM auth_identities WHERE kind = 'client' AND email = $1", [email.value]);
        identity = found.rows[0] || null;
        const eligible = identity
          && identity.status !== "disabled"
          && (kind !== "confirm_email" || identity.status === "pending_email");
        if (eligible) {
          const recent = await recentEmailTokenTimestamps(db, email.value, kind);
          if (!resendPolicyAllows(recent, Date.now())) {
            await audit(db, { actorKind: "client", actorId: identity.id, action: auditAction, target: identity.id, result: "denied", category: "throttled" });
            return ctx.json(res, 202, generic);
          }
          rawToken = generateToken();
          const client = await db.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              "UPDATE auth_email_tokens SET superseded_at = NOW() WHERE identity_id = $1 AND kind = $2 AND used_at IS NULL AND superseded_at IS NULL",
              [identity.id, kind],
            );
            await client.query(
              "INSERT INTO auth_email_tokens (id, identity_id, kind, email, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
              [randomUUID(), identity.id, kind, email.value, hashToken(rawToken), new Date(Date.now() + ttlMs)],
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            throw error;
          } finally {
            client.release();
          }
          await audit(db, { actorKind: "client", actorId: identity.id, action: auditAction, target: identity.id, result: "allowed" });
        }
      } catch (error) {
        return databaseFailure(ctx, res, error, "Could not prepare the client access link.");
      }
      if (rawToken) {
        const link = `${ctx.baseUrl}${pagePath}?token=${rawToken}`;
        await trySendAuthEmail({
          to: email.value, subject: emailSubject, text: buildEmailText(link),
          recipientKind: "client", template: "client_access_link",
        }, ctx.localOutbox);
      }
      return ctx.json(res, 202, generic);
    };
  }

  const handleRecover = createLinkResendHandler(
    "password_reset",
    "/cliente/redefinir-senha",
    PASSWORD_RESET_TTL_MS,
    "password_reset_request",
    "Recuperação de senha — Grupo SEG System",
    link => [
      "Recebemos um pedido de recuperação de senha para esta conta.",
      "",
      "Defina uma nova senha pelo link abaixo (válido por 1 hora, uso único):",
      link,
      "",
      "Se você não pediu a recuperação, ignore esta mensagem; sua senha atual segue valendo.",
      "Grupo SEG System Segurança Integrada",
    ].join("\n"),
  );

  const handleConfirmResend = createLinkResendHandler(
    "confirm_email",
    "/cliente/confirmar-email",
    CONFIRM_EMAIL_TTL_MS,
    "email_confirm_resend",
    "Confirme seu e-mail — Grupo SEG System",
    link => [
      "Segue um novo link de confirmação para o seu cadastro no portal do cliente.",
      "",
      "Confirme este endereço de e-mail pelo link abaixo (válido por 7 dias, uso único):",
      link,
      "",
      "Este novo link substitui os anteriores. Se você não reconhece o pedido, ignore.",
      "Grupo SEG System Segurança Integrada",
    ].join("\n"),
  );

  async function handleReset(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const passwordCheck = validatePasswordPolicy(body?.password);
    if (!passwordCheck.ok) return ctx.json(res, 400, { error: passwordCheck.error });
    const token = String(body?.token || "");
    if (!token || token.length > 200) return ctx.json(res, 400, { error: "reset_link_invalid" });

    let db;
    let client;
    try {
      db = ctx.getPool();
      client = await db.connect();
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT id, identity_id, expires_at, used_at, superseded_at FROM auth_email_tokens WHERE kind = 'password_reset' AND token_hash = $1 FOR UPDATE",
        [hashToken(token)],
      );
      const row = found.rows[0];
      const invalidCategory = !row
        ? "not_found"
        : row.used_at
          ? "used"
          : row.superseded_at
            ? "superseded"
            : new Date(row.expires_at).getTime() <= Date.now()
              ? "expired"
              : null;
      if (invalidCategory) {
        await client.query("ROLLBACK");
        await audit(db, { actorKind: "client", action: "password_reset_complete", target: row?.identity_id || null, result: "denied", category: invalidCategory });
        return ctx.json(res, 400, { error: "reset_link_invalid" });
      }
      await client.query(
        `INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)
         ON CONFLICT (identity_id) DO UPDATE SET password_hash = $2, password_set_at = NOW(), updated_at = NOW()`,
        [row.identity_id, await hashPassword(body.password)],
      );
      await client.query("UPDATE auth_email_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
      await client.query(
        "UPDATE auth_email_tokens SET superseded_at = NOW() WHERE identity_id = $1 AND kind = 'password_reset' AND used_at IS NULL AND superseded_at IS NULL",
        [row.identity_id],
      );
      await client.query("UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'password_reset' WHERE identity_id = $1 AND revoked_at IS NULL", [row.identity_id]);
      await client.query("COMMIT");
      await audit(db, { actorKind: "client", actorId: row.identity_id, action: "password_reset_complete", target: row.identity_id, result: "allowed" });
      await audit(db, { actorKind: "client", actorId: row.identity_id, action: "session_revoke_all", target: row.identity_id, result: "allowed" });
      return ctx.json(res, 200, { ok: true });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return databaseFailure(ctx, res, error, "Could not reset the client password.");
    } finally {
      client?.release();
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

  // Only an individually authenticated, currently active TI staff member may
  // approve an identity check. A legacy shared TI/Marcelo token has no actor ID.
  async function manualVerifier(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) { ctx.json(res, 401, { error: 'admin_session_required' }); return null; }
    if (session.role !== 'ti' || !session.identityId) {
      ctx.json(res, 403, { error: 'individual_ti_required' }); return null;
    }
    try {
      const db = ctx.getPool();
      const found = await db.query(`SELECT i.id, i.email, c.password_hash
        FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id=i.id
        JOIN auth_credentials c ON c.identity_id=i.id
        WHERE i.id=$1 AND i.kind='staff' AND i.status='active' AND p.role='ti'`, [session.identityId]);
      if (!found.rows[0]) { ctx.json(res, 403, { error: 'individual_ti_required' }); return null; }
      return { db, staff: found.rows[0] };
    } catch (error) {
      databaseFailure(ctx, res, error, 'Could not validate the manual verifier.'); return null;
    }
  }

  async function handleManualVerificationList(req, res) {
    if (!requireMethod(req, res, ['GET'])) return;
    const verifier = await manualVerifier(req, res); if (!verifier) return;
    try {
      const { rows } = await verifier.db.query(`SELECT i.id, i.email, i.display_name, i.status, i.created_at
        FROM auth_identities i WHERE i.kind='client' AND
        (i.status='pending_email' OR (i.status='active' AND i.verification_method IS NULL))
        AND EXISTS (SELECT 1 FROM auth_invites v WHERE v.used_by_identity=i.id AND v.used_at IS NOT NULL)
        ORDER BY i.created_at DESC LIMIT 100`);
      return ctx.json(res, 200, { pending: rows });
    } catch (error) { return databaseFailure(ctx, res, error, 'Could not list pending clients.'); }
  }

  async function handleManualVerificationApprove(req, res, identityId) {
    if (!requireMethod(req, res, ['POST'])) return;
    if (!requireSameOrigin(req, res)) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identityId)) {
      return ctx.json(res, 400, { error: 'invalid_identity' });
    }
    const verifier = await manualVerifier(req, res); if (!verifier) return;
    // Manual check is a temporary exception while SMTP is deliberately off;
    // never silently substitute it for a configured e-mail confirmation path.
    if (process.env.MAIL_HOST) return ctx.json(res, 409, { error: 'manual_verification_disabled_with_smtp' });
    const body = await readJsonOr400(req, res); if (body === undefined) return;
    const expectedEmail = normalizeEmail(body?.expectedEmail);
    const method = body?.method;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (expectedEmail.error || !['in_person', 'known_contact_callback'].includes(method) ||
        reason.length < 30 || reason.length > 500 || typeof body?.password !== 'string') {
      return ctx.json(res, 400, { error: 'manual_review_fields_required' });
    }
    // Re-auth is rate-limited in PostgreSQL by individual staff identity and
    // origin; the signed role cookie alone must not authorize this mutation.
    const originHash = hashOrigin(ctx.clientIp(req));
    try {
      const throttle = await verifier.db.query('SELECT failures, locked_until, last_failure_at FROM auth_login_throttle WHERE email=$1 AND origin_hash=$2',
        [verifier.staff.email, originHash]);
      const current = throttle.rows[0];
      if (current?.locked_until && new Date(current.locked_until).getTime() > Date.now()) {
        return ctx.json(res, 429, { error: 'temporarily_limited' });
      }
      if (!await verifyPassword(body.password, verifier.staff.password_hash)) {
        const failures = current && !throttleShouldReset(new Date(current.last_failure_at).getTime(), Date.now()) ? current.failures + 1 : 1;
        const delay = loginThrottleDelaySeconds(failures);
        await verifier.db.query(`INSERT INTO auth_login_throttle (email, origin_hash, failures, locked_until, last_failure_at)
          VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (email,origin_hash) DO UPDATE SET
          failures=$3, locked_until=$4, last_failure_at=NOW(), updated_at=NOW()`,
          [verifier.staff.email, originHash, failures, delay ? new Date(Date.now() + delay * 1000) : null]);
        await audit(verifier.db, { actorKind: 'staff', actorId: verifier.staff.id, action: 'account_status',
          target: identityId, result: 'denied', category: 'invalid_credentials' });
        return ctx.json(res, 403, { error: 'invalid_credentials' });
      }
    } catch (error) { return databaseFailure(ctx, res, error, 'Could not re-authenticate manual verifier.'); }
    let client;
    try {
      client = await verifier.db.connect(); await client.query('BEGIN');
      const { rows: [target] } = await client.query(`SELECT id, email, status, verification_method
        FROM auth_identities WHERE id=$1 AND kind='client' FOR UPDATE`, [identityId]);
      if (!target || target.email !== expectedEmail.value ||
          !(target.status === 'pending_email' || (target.status === 'active' && !target.verification_method))) {
        await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'verification_not_pending' });
      }
      // An accepted invitation is required; staff may not manufacture a client
      // identity and simply assert that it was verified out of band.
      const invite = await client.query('SELECT id FROM auth_invites WHERE used_by_identity=$1 AND used_at IS NOT NULL', [identityId]);
      if (!invite.rowCount) {
        await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'accepted_invite_required' });
      }
      await client.query(`INSERT INTO client_manual_verifications
        (id, identity_id, staff_identity_id, method, reason) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), identityId, verifier.staff.id, method, reason]);
      await client.query(`UPDATE auth_identities SET status='active', verification_method='manual',
        verified_at=NOW(), updated_at=NOW() WHERE id=$1`, [identityId]);
      await client.query(`UPDATE auth_email_tokens SET superseded_at=NOW()
        WHERE identity_id=$1 AND kind='confirm_email' AND used_at IS NULL AND superseded_at IS NULL`, [identityId]);
      await client.query(`UPDATE auth_sessions SET revoked_at=NOW(), revoke_reason='status_block'
        WHERE identity_id=$1 AND revoked_at IS NULL`, [identityId]);
      await client.query(`INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
        VALUES ('staff',$1,'account_status',$2,'allowed','none')`, [verifier.staff.id, identityId]);
      await client.query('DELETE FROM auth_login_throttle WHERE email=$1 AND origin_hash=$2', [verifier.staff.email, originHash]);
      await client.query('COMMIT');
      return ctx.json(res, 200, { ok: true, verificationMethod: 'manual', emailConfirmed: false });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return databaseFailure(ctx, res, error, 'Could not approve the manual client check.');
    } finally { client?.release(); }
  }

  async function handleInviteCreate(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const email = normalizeEmail(body?.email);
    if (email.error) return ctx.json(res, 400, { error: "invalid_email" });
    // The opt-in offline demonstration never invites a real mailbox. This is
    // not a global validation rule for other deployments with SMTP configured.
    if (process.env.SEG_LOCAL_DEMO_ONLY === 'true' && !email.value.endsWith('@example.invalid')) {
      return ctx.json(res, 400, { error: 'demo_synthetic_address_required' });
    }
    const displayName = sanitizeDisplayName(body?.displayName);
    if (displayName.error) return ctx.json(res, 400, { error: displayName.error });
    const scopeNote = typeof body?.scopeNote === "string" && body.scopeNote.trim() ? body.scopeNote.trim() : null;
    if (scopeNote && scopeNote.length > 500) return ctx.json(res, 400, { error: "scope_note_too_long" });

    let db;
    const inviteId = randomUUID();
    const rawToken = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    try {
      db = ctx.getPool();
      const existing = await db.query("SELECT id FROM auth_identities WHERE kind = 'client' AND email = $1", [email.value]);
      if (existing.rows[0]) {
        await audit(db, { actorKind: session.role, action: "invite_issue", target: existing.rows[0].id, result: "denied", category: "transition_invalid" });
        return ctx.json(res, 409, { error: "identity_exists" });
      }
      await db.query(
        "INSERT INTO auth_invites (id, kind, email, token_hash, scope_note, issued_by, expires_at) VALUES ($1,'client',$2,$3,$4,$5,$6)",
        [inviteId, email.value, hashToken(rawToken), scopeNote, session.role, expiresAt],
      );
      await audit(db, { actorKind: session.role, action: "invite_issue", target: inviteId, result: "allowed" });
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not create the client invite.");
    }

    const inviteUrl = `${ctx.baseUrl}/cliente/convite?token=${rawToken}`;
    const emailStatus = await trySendAuthEmail({
      to: email.value,
      subject: "Convite de acesso ao portal do cliente — Grupo SEG System",
      text: [
        "Você foi convidado a acessar o portal do cliente do Grupo SEG System.",
        "",
        `Aceite o convite pelo link abaixo (válido por 7 dias, uso único):`,
        inviteUrl,
        "",
        "Se você não esperava este convite, ignore esta mensagem.",
        "Grupo SEG System Segurança Integrada",
      ].join("\n"),
      recipientKind: "client",
      template: "client_invite",
      expiresAt,
    }, ctx.localOutbox);
    return ctx.json(res, 201, {
      inviteId,
      email: email.value,
      expiresAt: expiresAt.getTime(),
      emailStatus,
      // L02: com a caixa local o convite já está guardado e auditado, então o
      // token não precisa ser ecoado na resposta. Ele só volta quando não há
      // nenhum destino (nem SMTP, nem caixa local) e a entrega é manual.
      ...(emailStatus === "sent" || emailStatus === "local_outbox" ? {} : { inviteUrl }),
      deliveryNotice: emailStatus === "local_outbox" ? LOCAL_OUTBOX_LABEL : undefined,
    });
  }

  async function handleInviteList(req, res, url) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const status = url.searchParams.get("status");
    if (status && !INVITE_STATUSES.has(status)) return ctx.json(res, 400, { error: "invalid_status_filter" });
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.min(10_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
    const statusCase = `CASE
      WHEN used_at IS NOT NULL THEN 'used'
      WHEN revoked_at IS NOT NULL THEN 'revoked'
      WHEN expires_at <= NOW() THEN 'expired'
      ELSE 'pending' END`;
    try {
      const db = ctx.getPool();
      const values = [];
      let where = "";
      if (status) {
        values.push(status);
        where = `WHERE (${statusCase}) = $1`;
      }
      const listValues = [...values, limit, offset];
      const result = await db.query(
        `SELECT id, email, scope_note, issued_by, created_at, expires_at, used_at, revoked_at,
                (${statusCase}) AS status
         FROM auth_invites ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        listValues,
      );
      return ctx.json(res, 200, { invites: result.rows, limit, offset, role: session.role });
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not list the client invites.");
    }
  }

  async function handleInviteRevoke(req, res, inviteId) {
    if (!requireMethod(req, res, ["DELETE", "POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteId)) {
      return ctx.json(res, 400, { error: "invalid_invite_id" });
    }
    let db;
    try {
      db = ctx.getPool();
      const client = await db.connect();
      let outcome;
      try {
        await client.query("BEGIN");
        const found = await client.query("SELECT used_at, revoked_at FROM auth_invites WHERE id = $1 FOR UPDATE", [inviteId]);
        const row = found.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return ctx.json(res, 404, { error: "invite_not_found" });
        }
        if (row.used_at) {
          await client.query("ROLLBACK");
          return ctx.json(res, 409, { error: "invite_already_used" });
        }
        outcome = row.revoked_at ? "already_revoked" : "revoked";
        if (!row.revoked_at) {
          await client.query("UPDATE auth_invites SET revoked_at = NOW() WHERE id = $1", [inviteId]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      if (outcome === "revoked") {
        await audit(db, { actorKind: session.role, action: "invite_revoke", target: inviteId, result: "allowed" });
      }
      return ctx.json(res, 200, { ok: true, outcome });
    } catch (error) {
      return databaseFailure(ctx, res, error, "Could not revoke the client invite.");
    }
  }

  async function handleAuth(req, res, url) {
    switch (url.pathname) {
      case "/api/auth/login":
        return handleLogin(req, res);
      case "/api/auth/logout":
        return handleLogout(req, res);
      case "/api/auth/mfa/complete":
        return handleMfaComplete(req, res);
      case "/api/auth/me":
        return handleMe(req, res);
      case "/api/auth/invite/inspect":
        return handleInviteInspect(req, res, url);
      case "/api/auth/invite/accept":
        return handleInviteAccept(req, res);
      case "/api/auth/confirm-email":
        return handleEmailConfirm(req, res);
      case "/api/auth/confirm-email/resend":
        return handleConfirmResend(req, res);
      case "/api/auth/recover":
        return handleRecover(req, res);
      case "/api/auth/reset":
        return handleReset(req, res);
      default:
        return ctx.json(res, 404, { error: "not_found" });
    }
  }

  async function handleAdminInvites(req, res, url) {
    if (req.method === "GET") return handleInviteList(req, res, url);
    if (req.method === "POST") return handleInviteCreate(req, res);
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  return {
    handleAuth,
    handleAdminInvites,
    handleInviteRevoke,
    handleManualVerificationList,
    handleManualVerificationApprove,
    readClientSession,
  };
}
