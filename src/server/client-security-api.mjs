// SEC-06: real client TOTP enrollment. SEC-07 (e-mail change) remains disabled
// until an independently verifiable channel is approved without SMTP.
import { newMfaSetup, encryptMfaSecret, verifyMfaCode, mfaKey, newRecoveryCodes, hashRecoveryCode } from '../lib/client-mfa.mjs';
import { verifyPassword } from '../lib/client-auth-core.mjs';

export function createClientSecurityApi({ json, readJson, sameOrigin, getPool, readClientSession }) {
  async function guard(req, res, method) {
    if (req.method !== method) {
      json(res, 405, { error: 'method_not_allowed' }, { Allow: method }); return null;
    }
    if (!sameOrigin(req)) { json(res, 403, { error: 'same_origin_required' }); return null; }
    const session = await readClientSession(req);
    if (!session) { json(res, 401, { error: 'client_session_required' }); return null; }
    if (session.status !== 'active') { json(res, 403, { error: 'client_confirmation_required' }); return null; }
    return session;
  }
  async function bodyOrError(req, res) {
    try {
      const value = await readJson(req);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch (error) {
      if (error?.message === 'BODY_TOO_LARGE') { json(res, 413, { error: 'invalid_request' }); return null; }
    }
    json(res, 400, { error: 'invalid_request' });
    return null;
  }
  async function audit(db, identityId, action, result, category = "none") {
    try {
      await db.query(`INSERT INTO auth_access_audit
        (actor_kind, actor_id, action, target, result, detail_category) VALUES ('client',$1,$2,$1,$3,$4)`,
        [identityId, action, result, category]);
    } catch (cause) {
      const error = new Error("AUDIT_UNAVAILABLE", { cause });
      error.code = "AUDIT_UNAVAILABLE";
      throw error;
    }
  }
  async function passwordMatches(db, id, password) {
    if (typeof password !== 'string' || !password) return false;
    const { rows } = await db.query('SELECT password_hash FROM auth_credentials WHERE identity_id=$1', [id]);
    return Boolean(rows[0]) && verifyPassword(password, rows[0].password_hash);
  }
  function unavailable(res, error, cause = null) {
    return json(res, 503, { error: cause?.code === "AUDIT_UNAVAILABLE" ? "audit_unavailable" : error });
  }

  async function handleMfaSetup(req, res) {
    const session = await guard(req, res, 'POST'); if (!session) return;
    const body = await bodyOrError(req, res); if (!body) return;
    try {
      mfaKey();
      const db = getPool();
      if (!await passwordMatches(db, session.identityId, body.password)) {
        await audit(db, session.identityId, 'mfa_activate', 'denied', 'invalid_credentials');
        return json(res, 403, { error: 'invalid_credentials' });
      }
      const { secret, uri } = newMfaSetup(session.email);
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const saved = await client.query(`INSERT INTO auth_mfa (identity_id, totp_secret_encrypted)
          VALUES ($1,$2) ON CONFLICT (identity_id) DO UPDATE SET totp_secret_encrypted=EXCLUDED.totp_secret_encrypted,
            recovery_hashes='{}', last_used_step=NULL, attempts_since_verified=0, updated_at=NOW()
          WHERE auth_mfa.activated_at IS NULL RETURNING identity_id`,
          [session.identityId, encryptMfaSecret(secret, session.identityId)]);
        if (!saved.rowCount) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "mfa_already_active" });
        }
        await audit(client, session.identityId, "mfa_activate", "allowed");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return json(res, 200, { secret, uri, note: "save_secret_privately_then_activate" });
    } catch (error) { return unavailable(res, "mfa_unavailable", error); }
  }

  async function handleMfaActivate(req, res) {
    const session = await guard(req, res, 'POST'); if (!session) return;
    const body = await bodyOrError(req, res); if (!body) return;
    let client;
    try {
      mfaKey();
      const db = getPool(); client = await db.connect(); await client.query('BEGIN');
      const { rows: [record] } = await client.query('SELECT totp_secret_encrypted, activated_at, attempts_since_verified FROM auth_mfa WHERE identity_id=$1 FOR UPDATE', [session.identityId]);
      if (!record || record.activated_at) { await client.query('ROLLBACK'); return json(res, 409, { error: 'mfa_setup_required' }); }
      if (record.attempts_since_verified >= 5) { await client.query('ROLLBACK'); return json(res, 429, { error: 'mfa_setup_limited' }); }
      const result = await verifyMfaCode(record.totp_secret_encrypted, session.identityId, body.code);
      if (!result.valid) {
        await client.query("UPDATE auth_mfa SET attempts_since_verified=attempts_since_verified+1 WHERE identity_id=$1", [session.identityId]);
        await audit(client, session.identityId, "mfa_activate", "denied", "invalid_credentials");
        await client.query("COMMIT");
        return json(res, 403, { error: "mfa_code_invalid" });
      }
      const { codes, hashes } = newRecoveryCodes();
      await client.query(`UPDATE auth_mfa SET activated_at=NOW(), recovery_hashes=$2, attempts_since_verified=0,
        last_used_step=NULL, last_verified_at=NOW(), updated_at=NOW() WHERE identity_id=$1`, [session.identityId, hashes]);
      await audit(client, session.identityId, "mfa_activate", "allowed");
      await client.query("COMMIT");
      // The prior password-only cookie becomes invalid automatically by the
      // session's mfa_verified_at being null. Codes appear once, never logged.
      return json(res, 200, { ok: true, recoveryCodes: codes, loginRequired: true });
    } catch (error) { if (client) await client.query("ROLLBACK").catch(() => {}); return unavailable(res, "mfa_unavailable", error); }
    finally { client?.release(); }
  }

  async function handleMfaDisable(req, res) {
    const session = await guard(req, res, 'POST'); if (!session) return;
    const body = await bodyOrError(req, res); if (!body) return;
    let client;
    try {
      mfaKey(); const db = getPool(); client = await db.connect(); await client.query('BEGIN');
      const { rows: [record] } = await client.query("SELECT * FROM auth_mfa WHERE identity_id=$1 FOR UPDATE", [session.identityId]);
      if (!record?.activated_at || !await passwordMatches(client, session.identityId, body.password)) {
        await audit(client, session.identityId, "mfa_disable", "denied", "invalid_credentials");
        await client.query("COMMIT");
        return json(res, 403, { error: "invalid_credentials" });
      }
      if (record.attempts_since_verified >= 5) {
        await audit(client, session.identityId, "mfa_disable", "denied", "throttled");
        await client.query("COMMIT");
        return json(res, 429, { error: "mfa_temporarily_limited" });
      }
      const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
      const hash = hashRecoveryCode(code);
      const valid = (hash && record.recovery_hashes.includes(hash)) ||
        (!hash && (await verifyMfaCode(record.totp_secret_encrypted, session.identityId, code, record.last_used_step)).valid);
      if (!valid) {
        await client.query("UPDATE auth_mfa SET attempts_since_verified=attempts_since_verified+1 WHERE identity_id=$1", [session.identityId]);
        await audit(client, session.identityId, "mfa_disable", "denied", "invalid_credentials");
        await client.query("COMMIT");
        return json(res, 403, { error: "invalid_credentials" });
      }
      await client.query(`UPDATE auth_mfa SET activated_at=NULL, recovery_hashes='{}', last_used_step=NULL,
        attempts_since_verified=0, updated_at=NOW() WHERE identity_id=$1`, [session.identityId]);
      await client.query(`UPDATE auth_sessions SET revoked_at=NOW(), revoke_reason='status_block'
        WHERE identity_id=$1 AND revoked_at IS NULL`, [session.identityId]);
      await audit(client, session.identityId, "mfa_disable", "allowed");
      await client.query("COMMIT");
      return json(res, 200, { ok: true, loginRequired: true }, { 'Set-Cookie': 'seg_client_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    } catch (error) { if (client) await client.query("ROLLBACK").catch(() => {}); return unavailable(res, "mfa_unavailable", error); }
    finally { client?.release(); }
  }

  async function disabledEmailChange(req, res, method) {
    const session = await guard(req, res, method); if (!session) return;
    return unavailable(res, 'email_change_unavailable');
  }
  async function legacyVerify(req, res) {
    const session = await guard(req, res, 'POST'); if (!session) return;
    return unavailable(res, 'use_login_mfa_challenge');
  }
  return {
    handleMfaSetup, handleMfaActivate, handleMfaVerify: legacyVerify, handleMfaDisable,
    handleEmailChangeRequest: (req, res) => disabledEmailChange(req, res, 'POST'),
    handleEmailChangeConfirm: (req, res) => disabledEmailChange(req, res, 'PUT'),
    handleEmailChangeCancel: (req, res) => disabledEmailChange(req, res, 'DELETE'),
  };
}
