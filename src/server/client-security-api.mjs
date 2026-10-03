// CLI-14: account security is backed exclusively by auth_* canonical tables.
// cli_* v2 tables are not an authentication source and are intentionally unused.
import { randomUUID } from 'node:crypto';
import { newMfaSetup, encryptMfaSecret, verifyMfaCode, mfaKey, newRecoveryCodes, hashRecoveryCode } from '../lib/client-mfa.mjs';
import { verifyPassword, generateToken, hashToken, normalizeEmail } from '../lib/client-auth-core.mjs';

class AuditUnavailableError extends Error { constructor(cause) { super('AUDIT_UNAVAILABLE', { cause }); this.code = 'AUDIT_UNAVAILABLE'; } }
const fail = (res, error) => jsonRef(res, 503, { error: error?.code === 'AUDIT_UNAVAILABLE' ? 'audit_unavailable' : 'security_unavailable' });
let jsonRef;

export function createClientSecurityApi({ json, readJson, sameOrigin, getPool, readClientSession, localOutbox = null }) {
  jsonRef = json;
  async function audit(db, identityId, action, result = 'allowed', category = 'none') {
    try {
      await db.query(`INSERT INTO auth_access_audit
        (actor_kind, actor_id, action, target, result, detail_category)
        VALUES ('client',$1,$2,$1,$3,$4)`, [identityId, action, result, category]);
    } catch (cause) { throw new AuditUnavailableError(cause); }
  }
  async function guard(req, res, method) {
    if (req.method !== method) { json(res, 405, { error: 'method_not_allowed' }, { Allow: method }); return null; }
    if (!sameOrigin(req)) { json(res, 403, { error: 'same_origin_required' }); return null; }
    const session = await readClientSession(req);
    if (!session || session.status !== 'active') { json(res, session ? 403 : 401, { error: session ? 'client_confirmation_required' : 'client_session_required' }); return null; }
    return session;
  }
  async function body(req, res) {
    try { const value = await readJson(req); if (value && typeof value === 'object' && !Array.isArray(value)) return value; }
    catch (e) { if (e?.message === 'BODY_TOO_LARGE') { json(res, 413, { error: 'invalid_request' }); return null; } }
    json(res, 400, { error: 'invalid_request' }); return null;
  }
  async function transaction(db, work) { const c = await db.connect(); try { await c.query('BEGIN'); const out = await work(c); await c.query('COMMIT'); return out; } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); } }
  async function passwordMatches(db, id, password) {
    if (typeof password !== 'string' || !password) return false;
    const { rows } = await db.query('SELECT password_hash FROM auth_credentials WHERE identity_id=$1', [id]);
    return !!rows[0] && verifyPassword(password, rows[0].password_hash);
  }
  async function handleMfaSetup(req, res) {
    const s = await guard(req, res, 'POST'); if (!s) return; const b = await body(req, res); if (!b) return;
    try { mfaKey(); const db = getPool(); if (!await passwordMatches(db, s.identityId, b.password)) return json(res, 403, { error: 'invalid_credentials' });
      const setup = newMfaSetup(s.email); await transaction(db, async c => { const q = await c.query(`INSERT INTO auth_mfa(identity_id,totp_secret_encrypted) VALUES($1,$2) ON CONFLICT(identity_id) DO UPDATE SET totp_secret_encrypted=EXCLUDED.totp_secret_encrypted,recovery_hashes='{}',last_used_step=NULL,attempts_since_verified=0,updated_at=NOW() WHERE auth_mfa.activated_at IS NULL RETURNING identity_id`, [s.identityId, encryptMfaSecret(setup.secret, s.identityId)]); if (!q.rowCount) throw Object.assign(new Error('mfa_already_active'), { status: 409 }); await audit(c, s.identityId, 'mfa_activate'); });
      return json(res, 200, { secret: setup.secret, uri: setup.uri, expiresIn: 600 });
    } catch (e) { if (e?.status) return json(res, e.status, { error: e.message }); return fail(res, e); }
  }
  async function handleMfaActivate(req, res) {
    const s = await guard(req, res, 'POST'); if (!s) return; const b = await body(req, res); if (!b) return; let db;
    try { mfaKey(); db = getPool(); const result = await transaction(db, async c => { const { rows:[m] } = await c.query('SELECT * FROM auth_mfa WHERE identity_id=$1 FOR UPDATE', [s.identityId]); if (!m || m.activated_at) throw Object.assign(new Error('mfa_setup_required'), { status: 409 }); const v = await verifyMfaCode(m.totp_secret_encrypted, s.identityId, String(b.code || '')); if (!v.valid) { await audit(c,s.identityId,'mfa_activate','denied','invalid_credentials'); throw Object.assign(new Error('mfa_code_invalid'),{status:403}); } const { codes, hashes } = newRecoveryCodes(); await c.query(`UPDATE auth_mfa SET activated_at=NOW(),recovery_hashes=$2,last_used_step=$3,last_verified_at=NOW(),attempts_since_verified=0,updated_at=NOW() WHERE identity_id=$1`, [s.identityId, hashes, v.timeStep]); await audit(c,s.identityId,'mfa_activate'); return codes; }); return json(res,200,{ ok:true, recoveryCodes: result, loginRequired:true });
    } catch(e) { if(e?.status)return json(res,e.status,{error:e.message}); return fail(res,e); }
  }
  async function handleMfaDisable(req, res) {
    const s = await guard(req,res,'POST'); if(!s)return; const b=await body(req,res);if(!b)return;
    try { mfaKey(); const db=getPool(); await transaction(db,async c=>{ const {rows:[m]}=await c.query('SELECT * FROM auth_mfa WHERE identity_id=$1 FOR UPDATE',[s.identityId]); if(!m?.activated_at || !await passwordMatches(c,s.identityId,b.password)) throw Object.assign(new Error('invalid_credentials'),{status:403}); const code=String(b.code||'').trim().toLowerCase(); const rh=hashRecoveryCode(code); let valid=false; if(rh) { valid=m.recovery_hashes.includes(rh); if(valid) await c.query('UPDATE auth_mfa SET recovery_hashes=array_remove(recovery_hashes,$2) WHERE identity_id=$1',[s.identityId,rh]); } else valid=(await verifyMfaCode(m.totp_secret_encrypted,s.identityId,code,m.last_used_step)).valid; if(!valid) throw Object.assign(new Error('invalid_credentials'),{status:403}); await c.query(`UPDATE auth_mfa SET activated_at=NULL,recovery_hashes='{}',last_used_step=NULL,attempts_since_verified=0,updated_at=NOW() WHERE identity_id=$1`,[s.identityId]); await c.query(`UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='status_block' WHERE identity_id=$1 AND revoked_at IS NULL`,[s.identityId]); await audit(c,s.identityId,'mfa_disable'); }); return json(res,200,{ok:true,loginRequired:true},{'Set-Cookie':'seg_client_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'}); } catch(e){if(e?.status)return json(res,e.status,{error:e.message});return fail(res,e);}
  }
  async function handleMfaVerify(req,res){ const s=await guard(req,res,'POST'); if(!s)return; return json(res,410,{error:'mfa_verify_only_during_login'}); }
  async function handleSessions(req,res) {
    const s=await guard(req,res,'GET');if(!s)return; try { const {rows}=await getPool().query(`SELECT id,created_at,last_seen_at,expires_at,(id=$2) AS current, (revoked_at IS NULL AND expires_at>NOW()) AS active,user_agent FROM auth_sessions WHERE identity_id=$1 ORDER BY created_at DESC`,[s.identityId,s.sessionId]); return json(res,200,{sessions:rows}); } catch(e){return fail(res,e);}
  }
  async function handleSessionRevoke(req,res,id) {
    const s=await guard(req,res,'DELETE');if(!s)return; if(!/^[0-9a-f-]{36}$/i.test(id))return json(res,400,{error:'invalid_session'}); try { await transaction(getPool(),async c=>{ const q=await c.query(`UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='status_block' WHERE id=$1 AND identity_id=$2 AND revoked_at IS NULL RETURNING id`,[id,s.identityId]); if(!q.rowCount)return; await audit(c,s.identityId,'session_revoke_all'); }); return json(res,200,{ok:true}); }catch(e){return fail(res,e);}
  }
  async function handleSessionRevokeOthers(req,res) { const s=await guard(req,res,'POST');if(!s)return; try { await transaction(getPool(),async c=>{await c.query(`UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='status_block' WHERE identity_id=$1 AND id<>$2 AND revoked_at IS NULL`,[s.identityId,s.sessionId]);await audit(c,s.identityId,'session_revoke_all');});return json(res,200,{ok:true});}catch(e){return fail(res,e);} }
  async function handleEmailChangeRequest(req,res) { const s=await guard(req,res,'POST');if(!s)return;const b=await body(req,res);if(!b)return;const email=normalizeEmail(b.newEmail);if(email.error||email.value===s.email)return json(res,400,{error:'new_email_different_required'});try{const db=getPool();const token=generateToken();const hash=hashToken(token);const exp=new Date(Date.now()+24*60*60*1000);const result=await transaction(db,async c=>{const collision=await c.query("SELECT id FROM auth_identities WHERE kind='client' AND lower(email)=lower($1) AND id<>$2",[email.value,s.identityId]);if(collision.rowCount)throw Object.assign(new Error('email_already_in_use'),{status:409});const prior=await c.query("SELECT id FROM auth_email_change WHERE identity_id=$1 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at>NOW() FOR UPDATE",[s.identityId]);if(prior.rowCount)throw Object.assign(new Error('email_change_pending'),{status:409});const q=await c.query(`INSERT INTO auth_email_change(id,identity_id,old_email,new_email,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,expires_at`,[randomUUID(),s.identityId,s.email,email.value,hash,exp]);await audit(c,s.identityId,'email_change_request');return q.rows[0];}); if(localOutbox) await localOutbox.deliver({recipientKind:'client',recipientId:s.identityId,recipientAddress:email.value,channel:'email',template:'client_email_change',subject:'Confirme a troca de e-mail',body:`URL manual: /cliente/confirmar-email?token=${token}`,expiresAt:exp}); return json(res,202,{requestId:result.id,expiresAt:result.expires_at,delivery:localOutbox?'local_outbox':'manual'});}catch(e){return fail(res,e);}}
  async function handleEmailChangeConfirm(req,res) { const s=await guard(req,res,'PUT');if(!s)return;const b=await body(req,res);if(!b)return;const token=typeof b.token==='string'?b.token:'';try{const result=await transaction(getPool(),async c=>{const q=await c.query(`SELECT * FROM auth_email_change WHERE identity_id=$1 AND used_at IS NULL AND cancelled_at IS NULL FOR UPDATE`,[s.identityId]);const r=q.rows.find(x=>x.expires_at>new Date()&&x.token_hash===hashToken(token));if(!r)return null;const col=await c.query("SELECT id FROM auth_identities WHERE kind='client' AND lower(email)=lower($1) AND id<>$2",[r.new_email,s.identityId]);if(col.rowCount)throw Object.assign(new Error('email_already_in_use'),{status:409});await c.query('UPDATE auth_identities SET email=$2,updated_at=NOW() WHERE id=$1',[s.identityId,r.new_email]);await c.query('UPDATE auth_email_change SET used_at=NOW() WHERE id=$1',[r.id]);await c.query("UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='email_change' WHERE identity_id=$1 AND revoked_at IS NULL",[s.identityId]);await audit(c,s.identityId,'email_change_confirm');return r.id;});if(!result)return json(res,400,{error:'invalid_or_expired_token'});return json(res,200,{ok:true,sessionRevoked:true});}catch(e){if(e?.status)return json(res,e.status,{error:e.message});return fail(res,e);}}
  async function handleEmailChangeCancel(req,res){const s=await guard(req,res,'DELETE');if(!s)return;try{await transaction(getPool(),async c=>{const q=await c.query("UPDATE auth_email_change SET cancelled_at=NOW(),cancelled_by='user' WHERE identity_id=$1 AND used_at IS NULL AND cancelled_at IS NULL RETURNING id",[s.identityId]);if(q.rowCount)await audit(c,s.identityId,'email_change_cancel');});return json(res,200,{ok:true});}catch(e){return fail(res,e);}}
  return {handleMfaSetup,handleMfaActivate,handleMfaVerify,handleMfaDisable,handleSessions,handleSessionRevoke,handleSessionRevokeOthers,handleEmailChangeRequest,handleEmailChangeConfirm,handleEmailChangeCancel};
}
